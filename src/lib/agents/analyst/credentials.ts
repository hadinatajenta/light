import { ApiError } from '../../errors';
import { getSetting, setSetting } from '../../settings/store';
import { decryptSecret, encryptSecret, maskSecret } from '../secrets';

export const ANALYST_GSC_SERVICE_ACCOUNT_SETTING = 'analyst_gsc_service_account';
export const ANALYST_GSC_PROPERTY_SETTING = 'analyst_gsc_property';
export const ANALYST_GA4_SERVICE_ACCOUNT_SETTING = 'analyst_ga4_service_account';
export const ANALYST_GA4_PROPERTY_ID_SETTING = 'analyst_ga4_property_id';
export const ANALYST_GSC_TOKEN_SETTING = 'analyst_gsc_access_token';
export const ANALYST_GA4_TOKEN_SETTING = 'analyst_ga4_access_token';

export const ANALYST_GOOGLE_SOURCES = ['gsc', 'ga4'] as const;

export type AnalystGoogleSource = (typeof ANALYST_GOOGLE_SOURCES)[number];

const PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----/;

const SC_DOMAIN_PREFIX = 'sc-domain:';

export interface GoogleServiceAccount {
  clientEmail: string;
  projectId: string;
  privateKey: string;
}

export interface GoogleCredentialDescription {
  configured: boolean;
  hint: string | null;
  clientEmail: string | null;
  property: string | null;
}

export interface GscCredentials {
  serviceAccount: GoogleServiceAccount | null;
  property: string | null;
}

export interface Ga4Credentials {
  serviceAccount: GoogleServiceAccount | null;
  propertyId: string | null;
}

export interface AnalystCredentialDescriptions {
  gsc: GoogleCredentialDescription;
  ga4: GoogleCredentialDescription;
}

export interface CachedGoogleToken {
  accessToken: string;
  expiresAt: number;
}

function invalid(field: string, message: string): ApiError {
  return new ApiError(422, 'ANALYST_CREDENTIAL_INVALID', message, { field });
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function parseServiceAccount(raw: string): GoogleServiceAccount {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw invalid('serviceAccount', 'The service account JSON is empty.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw invalid('serviceAccount', 'The service account is not valid JSON.');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalid('serviceAccount', 'The service account must be a JSON object.');
  }

  const record = parsed as Record<string, unknown>;

  if (record.type !== 'service_account') {
    throw invalid('type', 'The JSON must carry a type of "service_account".');
  }

  const clientEmail = readNonEmptyString(record.client_email);
  if (!clientEmail?.includes('@')) {
    throw invalid('client_email', 'The service account needs a client_email address.');
  }

  const rawPrivateKey = typeof record.private_key === 'string' ? record.private_key : '';
  const privateKey = rawPrivateKey.includes('\\n')
    ? rawPrivateKey.replaceAll('\\n', '\n')
    : rawPrivateKey;

  if (privateKey.trim() === '') {
    throw invalid('private_key', 'The service account needs a private_key.');
  }

  if (!PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw invalid('private_key', 'The private_key must be a PEM encoded RSA private key.');
  }

  const projectId = readNonEmptyString(record.project_id);
  if (!projectId) {
    throw invalid('project_id', 'The service account needs a project_id.');
  }

  return { clientEmail, projectId, privateKey };
}

export function validateGscProperty(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw invalid('property', 'Provide the Search Console property.');
  }

  if (trimmed.startsWith(SC_DOMAIN_PREFIX)) {
    const domain = trimmed.slice(SC_DOMAIN_PREFIX.length).trim().toLowerCase();

    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
      throw invalid(
        'property',
        'The sc-domain property must name a domain such as sc-domain:example.com.',
      );
    }

    return `${SC_DOMAIN_PREFIX}${domain}`;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw invalid(
      'property',
      'Use a URL-prefix property such as https://example.com/ or an sc-domain: property.',
    );
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw invalid('property', 'Use a URL-prefix property with an http or https scheme.');
  }

  return trimmed;
}

export function validateGa4PropertyId(value: string): string {
  const trimmed = value.trim().replace(/^properties\//, '');

  if (!/^\d{4,20}$/.test(trimmed)) {
    throw invalid('propertyId', 'Provide the numeric GA4 property id.');
  }

  return trimmed;
}

function serializeServiceAccount(account: GoogleServiceAccount): string {
  return JSON.stringify({
    type: 'service_account',
    client_email: account.clientEmail,
    private_key: account.privateKey,
    project_id: account.projectId,
  });
}

function normalizeInput(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

async function readStoredServiceAccount(
  stored: string | null,
  keyMaterial?: string,
): Promise<GoogleServiceAccount | null> {
  if (!stored) {
    return null;
  }

  try {
    return parseServiceAccount(await decryptSecret(stored, keyMaterial));
  } catch {
    return null;
  }
}

export interface SaveGscCredentialsInput {
  serviceAccount?: string | null;
  property?: string | null;
}

export interface SaveGa4CredentialsInput {
  serviceAccount?: string | null;
  propertyId?: string | null;
}

export async function saveGscCredentials(
  db: D1Database,
  input: SaveGscCredentialsInput,
  keyMaterial?: string,
): Promise<void> {
  const serviceAccount = normalizeInput(input.serviceAccount);

  if (serviceAccount !== undefined) {
    await setSetting(
      db,
      ANALYST_GSC_SERVICE_ACCOUNT_SETTING,
      serviceAccount === null
        ? ''
        : await encryptSecret(
            serializeServiceAccount(parseServiceAccount(serviceAccount)),
            keyMaterial,
          ),
    );
  }

  const property = normalizeInput(input.property);

  if (property !== undefined) {
    await setSetting(
      db,
      ANALYST_GSC_PROPERTY_SETTING,
      property === null ? '' : validateGscProperty(property),
    );
  }
}

export async function readGscCredentials(
  db: D1Database,
  keyMaterial?: string,
): Promise<GscCredentials> {
  const [serviceAccount, property] = await Promise.all([
    getSetting(db, ANALYST_GSC_SERVICE_ACCOUNT_SETTING),
    getSetting(db, ANALYST_GSC_PROPERTY_SETTING),
  ]);

  return {
    serviceAccount: await readStoredServiceAccount(serviceAccount, keyMaterial),
    property: property && property.trim() !== '' ? property.trim() : null,
  };
}

export async function describeGscCredentials(
  db: D1Database,
  keyMaterial?: string,
): Promise<GoogleCredentialDescription> {
  const credentials = await readGscCredentials(db, keyMaterial);
  const account = credentials.serviceAccount;

  return {
    configured: account !== null && credentials.property !== null,
    hint: account ? maskSecret(account.privateKey) : null,
    clientEmail: account?.clientEmail ?? null,
    property: credentials.property,
  };
}

export async function saveGa4Credentials(
  db: D1Database,
  input: SaveGa4CredentialsInput,
  keyMaterial?: string,
): Promise<void> {
  const serviceAccount = normalizeInput(input.serviceAccount);

  if (serviceAccount !== undefined) {
    await setSetting(
      db,
      ANALYST_GA4_SERVICE_ACCOUNT_SETTING,
      serviceAccount === null
        ? ''
        : await encryptSecret(
            serializeServiceAccount(parseServiceAccount(serviceAccount)),
            keyMaterial,
          ),
    );
  }

  const propertyId = normalizeInput(input.propertyId);

  if (propertyId !== undefined) {
    await setSetting(
      db,
      ANALYST_GA4_PROPERTY_ID_SETTING,
      propertyId === null ? '' : validateGa4PropertyId(propertyId),
    );
  }
}

export async function readGa4Credentials(
  db: D1Database,
  keyMaterial?: string,
): Promise<Ga4Credentials> {
  const [serviceAccount, propertyId] = await Promise.all([
    getSetting(db, ANALYST_GA4_SERVICE_ACCOUNT_SETTING),
    getSetting(db, ANALYST_GA4_PROPERTY_ID_SETTING),
  ]);

  return {
    serviceAccount: await readStoredServiceAccount(serviceAccount, keyMaterial),
    propertyId: propertyId && propertyId.trim() !== '' ? propertyId.trim() : null,
  };
}

export async function describeGa4Credentials(
  db: D1Database,
  keyMaterial?: string,
): Promise<GoogleCredentialDescription> {
  const credentials = await readGa4Credentials(db, keyMaterial);
  const account = credentials.serviceAccount;

  return {
    configured: account !== null && credentials.propertyId !== null,
    hint: account ? maskSecret(account.privateKey) : null,
    clientEmail: account?.clientEmail ?? null,
    property: credentials.propertyId,
  };
}

export async function describeAnalystCredentials(
  db: D1Database,
  keyMaterial?: string,
): Promise<AnalystCredentialDescriptions> {
  const [gsc, ga4] = await Promise.all([
    describeGscCredentials(db, keyMaterial),
    describeGa4Credentials(db, keyMaterial),
  ]);

  return { gsc, ga4 };
}

function tokenSetting(source: AnalystGoogleSource): string {
  return source === 'gsc' ? ANALYST_GSC_TOKEN_SETTING : ANALYST_GA4_TOKEN_SETTING;
}

export function isGoogleTokenFresh(
  cached: CachedGoogleToken,
  nowMs: number,
  skewMs = 60_000,
): boolean {
  return cached.accessToken !== '' && cached.expiresAt - nowMs > skewMs;
}

export async function readCachedGoogleToken(
  db: D1Database,
  source: AnalystGoogleSource,
  keyMaterial?: string,
): Promise<CachedGoogleToken | null> {
  const stored = await getSetting(db, tokenSetting(source));

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      await decryptSecret(stored, keyMaterial),
    ) as Partial<CachedGoogleToken>;

    if (
      typeof parsed.accessToken !== 'string' ||
      parsed.accessToken === '' ||
      typeof parsed.expiresAt !== 'number' ||
      !Number.isFinite(parsed.expiresAt)
    ) {
      return null;
    }

    return { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export async function writeCachedGoogleToken(
  db: D1Database,
  source: AnalystGoogleSource,
  token: CachedGoogleToken,
  keyMaterial?: string,
): Promise<void> {
  await setSetting(
    db,
    tokenSetting(source),
    await encryptSecret(JSON.stringify(token), keyMaterial),
  );
}
