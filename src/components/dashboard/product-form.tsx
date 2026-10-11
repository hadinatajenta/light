import { CircleAlertIcon, LinkIcon, Loader2Icon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type SubmitEvent, useEffect, useRef, useState } from 'react';
import TagInput from '@/components/dashboard/tag-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import type { AffiliateNetwork, ProgramRecord } from './program-manager';
import { describeAffiliateFailure } from './program-manager';

const PRODUCTS_ENDPOINT = '/api/dashboard/monetization/products';
const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRODUCT_SLUG_MESSAGE =
  'Use lowercase letters, numbers, and single hyphens, for example desk-lamp-xl.';
const NAME_MAX_LENGTH = 120;
const TARGET_MAX_LENGTH = 500;
const IMAGE_URL_MAX_LENGTH = 500;
const NOTES_MAX_LENGTH = 1000;
const PRICE_MAX_AMOUNT = 1_000_000;
const TOPICS_MAX_COUNT = 12;
const SAFE_TARGET = /^[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+$/;
const SAFE_TRACKING_ID = /^[A-Za-z0-9_-]+$/;

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

const TARGET_HINT: Record<AffiliateNetwork, string> = {
  amazon: 'ASIN or a full amazon.com product URL, for example B0CX23V2ZK.',
  impact: 'The destination URL the network gave you, for example https://example.com/offer.',
  partnerstack: 'The destination URL the network gave you, for example https://example.com/offer.',
  shareasale: 'The merchant URL without tracking parameters, for example https://example.com/dp/1.',
  direct: 'The destination URL for this product.',
};

export interface ProductRecord {
  id: string;
  slug: string;
  name: string;
  programId: string;
  programName: string;
  target: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  imageUrl: string | null;
  topics: string[];
  notes: string | null;
  isActive: boolean;
  affiliateUrl: string | null;
  referenceCount: number;
}

export interface ProductInput {
  slug: string;
  name: string;
  programId: string;
  target: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  imageUrl: string | null;
  topics: string[];
  notes: string | null;
  isActive: boolean;
}

export function buildAffiliateUrlPreview(program: ProgramRecord, target: string): string | null {
  if (program.status !== 'approved' || !program.trackingId || !program.linkTemplate) {
    return null;
  }
  if (!SAFE_TARGET.test(target) || !SAFE_TRACKING_ID.test(program.trackingId)) {
    return null;
  }
  return program.linkTemplate
    .replaceAll('{target}', target)
    .replaceAll('{trackingId}', program.trackingId);
}

export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isSafeImageUrl(value: string): boolean {
  if (value.startsWith('/')) {
    return !value.startsWith('//');
  }
  return value.startsWith('https://') || value.startsWith('http://');
}

interface ProductFormValues {
  slug: string;
  name: string;
  programId: string;
  target: string;
  priceAmount: string;
  priceCurrency: string;
  imageUrl: string;
  topics: string[];
  notes: string;
  isActive: boolean;
}

interface ProductFormErrors {
  slug?: string;
  name?: string;
  programId?: string;
  target?: string;
  priceAmount?: string;
  priceCurrency?: string;
  imageUrl?: string;
  topics?: string;
  notes?: string;
  form?: string;
}

function toFormValues(product: ProductRecord | null): ProductFormValues {
  return {
    slug: product?.slug ?? '',
    name: product?.name ?? '',
    programId: product?.programId ?? '',
    target: product?.target ?? '',
    priceAmount:
      product?.priceAmount === null || product?.priceAmount === undefined
        ? ''
        : String(product.priceAmount),
    priceCurrency: product?.priceCurrency ?? '',
    imageUrl: product?.imageUrl ?? '',
    topics: product?.topics ?? [],
    notes: product?.notes ?? '',
    isActive: product?.isActive ?? true,
  };
}

function validateProductForm(values: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {};
  const name = values.name.trim();
  const target = values.target.trim();
  const priceAmount = values.priceAmount.trim();
  const priceCurrency = values.priceCurrency.trim();
  const imageUrl = values.imageUrl.trim();

  if (!PRODUCT_SLUG_PATTERN.test(values.slug)) {
    errors.slug = PRODUCT_SLUG_MESSAGE;
  } else if (values.slug.length > 60) {
    errors.slug = 'Slug must be 60 characters or fewer.';
  }

  if (name.length < 2 || name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be between 2 and ${NAME_MAX_LENGTH} characters.`;
  }

  if (!values.programId) {
    errors.programId = 'Choose a program for this product.';
  }

  if (target.length === 0) {
    errors.target = 'Enter the target the program needs.';
  } else if (target.length > TARGET_MAX_LENGTH) {
    errors.target = `Target must be ${TARGET_MAX_LENGTH} characters or fewer.`;
  } else if (!SAFE_TARGET.test(target)) {
    errors.target = 'Remove spaces, quotes, and angle brackets from the target.';
  }

  if (priceAmount.length > 0) {
    const parsedAmount = Number(priceAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      errors.priceAmount = 'Enter a price of zero or more.';
    } else if (parsedAmount > PRICE_MAX_AMOUNT) {
      errors.priceAmount = `Price must be ${PRICE_MAX_AMOUNT.toLocaleString('en-US')} or less.`;
    }
  }

  if (priceCurrency.length > 0 && !/^[A-Za-z]{3}$/.test(priceCurrency)) {
    errors.priceCurrency = 'Use a three letter code, for example USD.';
  }

  if (priceAmount.length > 0 && priceCurrency.length === 0) {
    errors.priceCurrency = 'Add the currency for this price.';
  }

  if (priceCurrency.length > 0 && priceAmount.length === 0) {
    errors.priceAmount = 'Add the price for this currency.';
  }

  if (imageUrl.length > 0 && !isSafeImageUrl(imageUrl)) {
    errors.imageUrl = 'Use an http or https URL, or a path that starts with a slash.';
  } else if (imageUrl.length > IMAGE_URL_MAX_LENGTH) {
    errors.imageUrl = `Image URL must be ${IMAGE_URL_MAX_LENGTH} characters or fewer.`;
  }

  if (values.topics.length > TOPICS_MAX_COUNT) {
    errors.topics = `Use at most ${TOPICS_MAX_COUNT} topics.`;
  }

  if (values.notes.trim().length > NOTES_MAX_LENGTH) {
    errors.notes = `Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`;
  }

  return errors;
}

export interface ProductFormProps {
  isOpen: boolean;
  product: ProductRecord | null;
  programs: ProgramRecord[];
  isLoading: boolean;
  loadError: string | null;
  onReload: () => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (payload: ProductInput) => Promise<ProductFormErrors | null>;
}

export default function ProductForm({
  isOpen,
  product,
  programs,
  isLoading,
  loadError,
  onReload,
  onOpenChange,
  onSubmit,
}: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(() => toFormValues(product));
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSlugEdited, setIsSlugEdited] = useState(false);
  const [resolveNote, setResolveNote] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const slugRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const programRef = useRef<HTMLSelectElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);
  const priceAmountRef = useRef<HTMLInputElement>(null);
  const priceCurrencyRef = useRef<HTMLInputElement>(null);
  const imageUrlRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setValues(toFormValues(product));
    setErrors({});
    setIsSlugEdited(product !== null);
    setIsSubmitting(false);
  }, [isOpen, product]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen || programs.length === 0) {
      return;
    }

    setValues((current) => {
      if (current.programId.length > 0) {
        return current;
      }

      return { ...current, programId: programs[0].id };
    });
  }, [isOpen, programs]);

  const focusFirstError = (nextErrors: ProductFormErrors) => {
    const order: Array<[keyof ProductFormErrors, { focus: () => void } | null]> = [
      ['slug', slugRef.current],
      ['name', nameRef.current],
      ['programId', programRef.current],
      ['target', targetRef.current],
      ['priceAmount', priceAmountRef.current],
      ['priceCurrency', priceCurrencyRef.current],
      ['imageUrl', imageUrlRef.current],
      ['notes', notesRef.current],
    ];
    for (const [key, node] of order) {
      if (nextErrors[key] && node) {
        node.focus();
        return;
      }
    }
  };

  const activeProgram = programs.find((program) => program.id === values.programId) ?? null;
  const trimmedTarget = values.target.trim();
  const affiliateUrl =
    activeProgram && trimmedTarget.length > 0
      ? buildAffiliateUrlPreview(activeProgram, trimmedTarget)
      : null;
  const isProgramStale =
    product !== null &&
    product.affiliateUrl !== null &&
    product.programId === values.programId &&
    product.target === trimmedTarget &&
    affiliateUrl === null;
  const isTargetSafe = trimmedTarget.length > 0 && SAFE_TARGET.test(trimmedTarget);
  const previewFailure =
    activeProgram === null
      ? 'Choose a program so the link can be built.'
      : isTargetSafe
        ? describeAffiliateFailure(activeProgram)
        : 'This target cannot be used in a link. Remove spaces, quotes, and angle brackets.';
  const targetHint = activeProgram
    ? TARGET_HINT[activeProgram.network]
    : 'Choose a program first, then enter its target.';
  const isPendingEdit = product !== null;

  const handleTargetResolve = async (rawTarget: string): Promise<void> => {
    const candidate = rawTarget.trim();

    if (activeProgram?.network !== 'amazon' || !candidate.includes('://')) {
      return;
    }

    try {
      const resolved = await requestJson<{
        target: string;
        name: string | null;
        slug: string | null;
      }>(`${PRODUCTS_ENDPOINT}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ programId: activeProgram.id, target: candidate }),
      });

      setValues((current) => ({
        ...current,
        target: resolved.target,
        name: current.name.trim().length > 0 ? current.name : (resolved.name ?? current.name),
        slug: isSlugEdited ? current.slug : (resolved.slug ?? current.slug),
      }));

      const isQuickAdd = product === null && values.name.trim() === '' && values.slug.trim() === '';
      const nextName = values.name.trim().length > 0 ? values.name : (resolved.name ?? '');
      const nextSlug = isSlugEdited ? values.slug : (resolved.slug ?? '');

      if (
        isQuickAdd &&
        nextName.trim().length > 0 &&
        nextSlug.trim().length > 0 &&
        !isSubmitting &&
        isMountedRef.current
      ) {
        setResolveNote('Saving this product...');
        setIsSubmitting(true);

        const serverErrors = await saveProduct({
          ...values,
          target: resolved.target,
          name: nextName,
          slug: nextSlug,
        }).finally(() => {
          if (isMountedRef.current) {
            setIsSubmitting(false);
          }
        });

        if (!isMountedRef.current) {
          return;
        }

        if (serverErrors) {
          setErrors(serverErrors);
          setResolveNote('Could not save automatically. Fix the fields and press Save.');
          focusFirstError(serverErrors);
          return;
        }

        setResolveNote(null);
        onOpenChange(false);
        return;
      }

      setResolveNote(
        resolved.target === candidate
          ? null
          : 'Read the ASIN and the name from the URL. Check the name before saving.',
      );
    } catch (error) {
      setResolveNote(toErrorMessage(error));
    }
  };

  const saveProduct = async (formValues: ProductFormValues): Promise<ProductFormErrors | null> =>
    onSubmit({
      slug: formValues.slug.trim(),
      name: formValues.name.trim(),
      programId: formValues.programId,
      target: formValues.target.trim(),
      priceAmount:
        formValues.priceAmount.trim() === '' ? null : Number(formValues.priceAmount.trim()),
      priceCurrency:
        formValues.priceCurrency.trim() === ''
          ? null
          : formValues.priceCurrency.trim().toUpperCase(),
      imageUrl: formValues.imageUrl.trim() || null,
      topics: formValues.topics,
      notes: formValues.notes.trim() || null,
      isActive: formValues.isActive,
    });

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    const validationErrors = validateProductForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      focusFirstError(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    const serverErrors = await saveProduct(values).finally(() => {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    });

    if (!isMountedRef.current) {
      return;
    }
    if (serverErrors) {
      setErrors(serverErrors);
      focusFirstError(serverErrors);
      return;
    }
    onOpenChange(false);
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <span className="sr-only">Loading product form</span>
          <div className="h-4 w-16 animate-pulse rounded bg-accent" />
          <div className="h-9 w-full animate-pulse rounded bg-accent" />
          <div className="h-9 w-full animate-pulse rounded bg-accent" />
          <div className="h-24 w-full animate-pulse rounded bg-accent" />
        </div>
      );
    }

    if (loadError !== null && programs.length === 0) {
      return (
        <div className="flex flex-col items-start gap-3">
          <CircleAlertIcon className="size-6 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not load your programs</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={onReload}
            className="rounded-md border border-input px-3 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isSubmitting}
      >
        {programs.length === 0 ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            You have no programs yet. Create a program first, then add products to it.{' '}
            <a
              href="/dashboard/monetization"
              className="text-foreground underline underline-offset-4"
            >
              Go to programs
            </a>
            .
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="product-name">Name</Label>
          <Input
            id="product-name"
            ref={nameRef}
            value={values.name}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'product-name-error' : undefined}
            placeholder="Anker 737 power bank"
            onChange={(event) => {
              const nextName = event.target.value;
              setValues((current) => ({
                ...current,
                name: nextName,
                slug: isSlugEdited ? current.slug : toSlug(nextName),
              }));
            }}
          />
          {errors.name ? (
            <p id="product-name-error" className="text-sm text-destructive">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="product-slug">Slug</Label>
          <Input
            id="product-slug"
            ref={slugRef}
            value={values.slug}
            maxLength={60}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            aria-invalid={Boolean(errors.slug)}
            aria-describedby={
              errors.slug ? 'product-slug-error product-slug-help' : 'product-slug-help'
            }
            placeholder="anker-737-power-bank"
            onChange={(event) => {
              setIsSlugEdited(true);
              setValues((current) => ({ ...current, slug: event.target.value }));
            }}
          />
          <p id="product-slug-help" className="text-xs text-muted-foreground">
            Posts link to this slug with the product block, for example{' '}
            <span className="font-mono">product:{values.slug || 'product-slug'}</span>.
          </p>
          {errors.slug ? (
            <p id="product-slug-error" className="text-sm text-destructive">
              {errors.slug}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="product-program">Program</Label>
          <select
            id="product-program"
            ref={programRef}
            className={SELECT_CLASS}
            value={values.programId}
            aria-invalid={Boolean(errors.programId)}
            aria-describedby={errors.programId ? 'product-program-error' : undefined}
            onChange={(event) =>
              setValues((current) => ({ ...current, programId: event.target.value }))
            }
          >
            <option value="">Select a program</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
          {errors.programId ? (
            <p id="product-program-error" className="text-sm text-destructive">
              {errors.programId}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="product-target">ASIN or URL</Label>
          <Input
            id="product-target"
            ref={targetRef}
            value={values.target}
            maxLength={TARGET_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
            aria-invalid={Boolean(errors.target)}
            aria-describedby={
              errors.target ? 'product-target-error product-target-help' : 'product-target-help'
            }
            placeholder={
              activeProgram?.network === 'amazon' ? 'B0CX23V2ZK' : 'https://example.com/dp/1'
            }
            onChange={(event) =>
              setValues((current) => ({ ...current, target: event.target.value }))
            }
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text');
              if (pasted.includes('://')) {
                void handleTargetResolve(pasted);
              }
            }}
            onBlur={(event) => void handleTargetResolve(event.target.value)}
          />
          <p id="product-target-help" className="text-xs text-muted-foreground">
            {targetHint}
          </p>
          {resolveNote ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {resolveNote}
            </p>
          ) : null}
          {errors.target ? (
            <p id="product-target-error" className="text-sm text-destructive">
              {errors.target}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
              Live link preview
            </p>
          </div>
          {affiliateUrl ? (
            <>
              <p className="break-all font-mono text-xs text-foreground">{affiliateUrl}</p>
              <p className="text-xs text-muted-foreground">
                Clicks are counted at the redirect and shown in the report.
              </p>
            </>
          ) : (
            <div className="flex items-start gap-2">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="text-sm text-foreground">No link can be built yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {trimmedTarget.length === 0
                    ? 'Enter a target to see the final link here.'
                    : previewFailure}
                </p>
                {isProgramStale ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    This product had a working link when it was saved. The program data on this page
                    may be out of date, so reload the catalog before changing the program.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="product-price-amount">Price amount</Label>
            <Input
              id="product-price-amount"
              ref={priceAmountRef}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.priceAmount}
              aria-invalid={Boolean(errors.priceAmount)}
              aria-describedby={errors.priceAmount ? 'product-price-amount-error' : undefined}
              placeholder="129.99"
              onChange={(event) =>
                setValues((current) => ({ ...current, priceAmount: event.target.value }))
              }
            />
            {errors.priceAmount ? (
              <p id="product-price-amount-error" className="text-sm text-destructive">
                {errors.priceAmount}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="product-price-currency">Price currency</Label>
            <Input
              id="product-price-currency"
              ref={priceCurrencyRef}
              value={values.priceCurrency}
              maxLength={3}
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase"
              aria-invalid={Boolean(errors.priceCurrency)}
              aria-describedby={
                errors.priceCurrency
                  ? 'product-price-currency-error'
                  : 'product-price-currency-help'
              }
              placeholder="USD"
              onChange={(event) =>
                setValues((current) => ({ ...current, priceCurrency: event.target.value }))
              }
            />
            {errors.priceCurrency ? (
              <p id="product-price-currency-error" className="text-sm text-destructive">
                {errors.priceCurrency}
              </p>
            ) : (
              <p id="product-price-currency-help" className="text-xs text-muted-foreground">
                Three letter code, for example USD or EUR.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="product-image-url">Image URL</Label>
          <Input
            id="product-image-url"
            ref={imageUrlRef}
            value={values.imageUrl}
            maxLength={IMAGE_URL_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
            aria-invalid={Boolean(errors.imageUrl)}
            aria-describedby={errors.imageUrl ? 'product-image-url-error' : undefined}
            placeholder="https://example.com/image.jpg"
            onChange={(event) =>
              setValues((current) => ({ ...current, imageUrl: event.target.value }))
            }
          />
          {errors.imageUrl ? (
            <p id="product-image-url-error" className="text-sm text-destructive">
              {errors.imageUrl}
            </p>
          ) : null}
        </div>

        <TagInput
          values={values.topics}
          disabled={isSubmitting}
          onChange={(topics) => setValues((current) => ({ ...current, topics }))}
        />
        {errors.topics ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.topics}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="product-notes">Notes</Label>
          <textarea
            id="product-notes"
            ref={notesRef}
            rows={3}
            className={TEXTAREA_CLASS}
            value={values.notes}
            maxLength={NOTES_MAX_LENGTH}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={errors.notes ? 'product-notes-error' : undefined}
            placeholder="Why this product is worth recommending, or who it suits."
            onChange={(event) =>
              setValues((current) => ({ ...current, notes: event.target.value }))
            }
          />
          {errors.notes ? (
            <p id="product-notes-error" className="text-sm text-destructive">
              {errors.notes}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <input
            id="product-active"
            type="checkbox"
            className="size-4 rounded border-input accent-primary"
            checked={values.isActive}
            onChange={(event) =>
              setValues((current) => ({ ...current, isActive: event.target.checked }))
            }
          />
          <Label htmlFor="product-active">Active</Label>
          <span className="text-xs text-muted-foreground">
            Inactive products stay in the catalog but are not linked from posts.
          </span>
        </div>

        {errors.form ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errors.form}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            className="whitespace-nowrap"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || programs.length === 0}
            className="whitespace-nowrap"
          >
            {isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            {isPendingEdit
              ? isSubmitting
                ? 'Saving'
                : 'Save changes'
              : isSubmitting
                ? 'Creating'
                : 'Create product'}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogSurface className="max-h-[90dvh] overflow-y-auto">
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            {isPendingEdit ? 'Edit product' : 'New product'}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {isPendingEdit
              ? 'Update the program, target, and details for this product. The preview shows the link the site will build.'
              : 'A product turns a program target into a tracked link that posts can use.'}
          </DialogPrimitive.Description>
        </div>
        {renderBody()}
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}
