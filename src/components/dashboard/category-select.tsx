import { CheckIcon, ChevronDownIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toSlug } from '@/lib/content/slug';
import { cn } from '@/lib/utils';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';

const CATEGORIES_ENDPOINT = '/api/dashboard/categories';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_FORMAT_MESSAGE =
  'Use lowercase letters, numbers, and single hyphens, for example desk-setup.';
const DESCRIPTION_MAX_LENGTH = 160;

const TEXTAREA_CLASS_NAME =
  'min-h-20 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

interface CategoryRecord {
  slug: string;
  label: string;
  description: string;
  postCount: number;
}

interface CategoryFormValues {
  label: string;
  slug: string;
  description: string;
}

interface CategoryFormErrors {
  label?: string;
  slug?: string;
  description?: string;
  form?: string;
}

function validateForm(values: CategoryFormValues): CategoryFormErrors {
  const errors: CategoryFormErrors = {};
  const label = values.label.trim();

  if (label.length < 2 || label.length > 60) {
    errors.label = 'Name must be between 2 and 60 characters.';
  }
  if (!SLUG_PATTERN.test(values.slug)) {
    errors.slug = SLUG_FORMAT_MESSAGE;
  }
  if (values.description.trim().length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  return errors;
}

interface CreateCategoryDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: (category: CategoryRecord) => void;
}

function CreateCategoryDialog({ isOpen, onOpenChange, onCreated }: CreateCategoryDialogProps) {
  const [values, setValues] = useState<CategoryFormValues>({
    label: '',
    slug: '',
    description: '',
  });
  const [errors, setErrors] = useState<CategoryFormErrors>({});
  const [isSlugEdited, setIsSlugEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setValues({ label: '', slug: '', description: '' });
    setErrors({});
    setIsSlugEdited(false);
    setIsSubmitting(false);
  }, [isOpen]);

  const focusFirstError = (nextErrors: CategoryFormErrors) => {
    if (nextErrors.label) {
      labelRef.current?.focus();
      return;
    }
    if (nextErrors.slug) {
      slugRef.current?.focus();
      return;
    }
    if (nextErrors.description) {
      descriptionRef.current?.focus();
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleLabelChange = (label: string) => {
    setValues((current) => ({
      ...current,
      label,
      slug: isSlugEdited ? current.slug : toSlug(label),
    }));
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    const validationErrors = validateForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      focusFirstError(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      const payload = await requestJson<{ category: CategoryRecord }>(CATEGORIES_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: values.slug,
          label: values.label.trim(),
          description: values.description.trim(),
        }),
      });
      toast.success(`Created ${payload.category.label}.`);
      onCreated({ ...payload.category, postCount: 0 });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'CATEGORY_EXISTS') {
        setErrors({ slug: error.message });
        slugRef.current?.focus();
      } else {
        setErrors({ form: toErrorMessage(error) });
      }
      toast.error(toErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const slugErrorText =
    errors.slug ??
    (values.slug.length > 0 && !SLUG_PATTERN.test(values.slug) ? SLUG_FORMAT_MESSAGE : undefined);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogSurface>
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Add category
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            Create a topic so posts can be grouped and linked across the site.
          </DialogPrimitive.Description>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-category-label">Name</Label>
            <Input
              id="new-category-label"
              ref={labelRef}
              value={values.label}
              onChange={(event) => handleLabelChange(event.target.value)}
              maxLength={60}
              autoComplete="off"
              aria-invalid={Boolean(errors.label)}
              aria-describedby={errors.label ? 'new-category-label-error' : undefined}
              placeholder="Desk setup"
            />
            {errors.label ? (
              <p id="new-category-label-error" className="text-sm text-destructive">
                {errors.label}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-category-slug">Slug</Label>
            <Input
              id="new-category-slug"
              ref={slugRef}
              value={values.slug}
              onChange={(event) => {
                setIsSlugEdited(true);
                setValues((current) => ({ ...current, slug: event.target.value }));
              }}
              maxLength={60}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={Boolean(slugErrorText)}
              aria-describedby={slugErrorText ? 'new-category-slug-error' : undefined}
              placeholder="desk-setup"
            />
            {slugErrorText ? (
              <p id="new-category-slug-error" className="text-sm text-destructive">
                {slugErrorText}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="new-category-description">Description</Label>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  values.description.length > DESCRIPTION_MAX_LENGTH
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {values.description.length}/{DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="new-category-description"
              ref={descriptionRef}
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'new-category-description-error' : undefined}
              placeholder="A short summary of what this topic covers."
              className={TEXTAREA_CLASS_NAME}
            />
            {errors.description ? (
              <p id="new-category-description-error" className="text-sm text-destructive">
                {errors.description}
              </p>
            ) : null}
          </div>

          {errors.form ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errors.form}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="whitespace-nowrap">
              {isSubmitting ? 'Creating...' : 'Create category'}
            </Button>
          </div>
        </form>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

interface CategorySelectProps {
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}

export default function CategorySelect({ value, onChange, disabled = false }: CategorySelectProps) {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadCategories = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<{ categories: CategoryRecord[] }>(CATEGORIES_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setCategories(payload.categories);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadCategories();
    return () => controllerRef.current?.abort();
  }, [loadCategories]);

  useEffect(() => {
    if (status === 'ready' && categories.length === 0) {
      setIsDialogOpen(true);
    }
  }, [status, categories.length]);

  const selectedCategory = categories.find((category) => category.slug === value) ?? null;
  const isDisabled = disabled || status === 'loading';

  const handleCreated = (category: CategoryRecord) => {
    setCategories((current) => [...current, category]);
    onChange(category.slug);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="post-category">Category</Label>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id="post-category"
            type="button"
            variant="outline"
            disabled={isDisabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', selectedCategory ? '' : 'text-muted-foreground')}>
              {selectedCategory ? selectedCategory.label : 'Select a category'}
            </span>
            <ChevronDownIcon className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
          <DropdownMenuLabel>Category</DropdownMenuLabel>
          {status === 'error' ? (
            <DropdownMenuItem onSelect={() => loadCategories()}>
              <RefreshCwIcon />
              Could not load. Retry.
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => onChange('')}>
                {value === '' ? <CheckIcon /> : <span className="size-4" />}
                No category
              </DropdownMenuItem>
              {categories.map((category) => (
                <DropdownMenuItem key={category.slug} onSelect={() => onChange(category.slug)}>
                  {value === category.slug ? <CheckIcon /> : <span className="size-4" />}
                  <span className="truncate">{category.label}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIsDialogOpen(true)}>
            <PlusIcon />
            Create new category
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {status === 'error' ? (
        <p className="text-xs text-destructive">{loadError}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Group this post under a topic. The slug becomes its topic URL.
        </p>
      )}

      <CreateCategoryDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
