import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';

const CATEGORIES_ENDPOINT = '/api/dashboard/categories';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_FORMAT_MESSAGE =
  'Use lowercase letters, numbers, and single hyphens, for example desk-setup.';
const DESCRIPTION_MAX_LENGTH = 160;

interface CategoryRecord {
  slug: string;
  label: string;
  description: string;
  postCount: number;
}

interface CategoryPayload {
  slug: string;
  label: string;
  description: string;
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

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateCategoryForm(values: CategoryFormValues): CategoryFormErrors {
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

function CategoryTableHead() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="text-xs tracking-wider text-muted-foreground uppercase">
          Name
        </TableHead>
        <TableHead className="text-xs tracking-wider text-muted-foreground uppercase">
          Slug
        </TableHead>
        <TableHead className="text-xs tracking-wider text-muted-foreground uppercase">
          Description
        </TableHead>
        <TableHead className="text-right text-xs tracking-wider text-muted-foreground uppercase">
          Posts
        </TableHead>
        <TableHead className="text-right text-xs tracking-wider text-muted-foreground uppercase">
          Actions
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

function CategoryTableSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading categories</span>
      <Table>
        <CategoryTableHead />
        <TableBody>
          {[0, 1, 2].map((rowIndex) => (
            <TableRow key={rowIndex}>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-56" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-6" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-7 w-16" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface CategoryTableProps {
  categories: CategoryRecord[];
  onEditCategory: (category: CategoryRecord) => void;
  onDeleteCategory: (category: CategoryRecord) => void;
}

function CategoryTable({ categories, onEditCategory, onDeleteCategory }: CategoryTableProps) {
  return (
    <Table>
      <CategoryTableHead />
      <TableBody>
        {categories.map((category) => (
          <TableRow key={category.slug}>
            <TableCell className="font-medium text-foreground">{category.label}</TableCell>
            <TableCell>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {category.slug}
              </code>
            </TableCell>
            <TableCell className="max-w-[24rem] whitespace-normal text-muted-foreground">
              <span className="line-clamp-2">{category.description || 'No description'}</span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{category.postCount}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${category.label}`}
                  onClick={() => onEditCategory(category)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${category.label}`}
                  onClick={() => onDeleteCategory(category)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface CategoryFormDialogProps {
  isOpen: boolean;
  editingCategory: CategoryRecord | null;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (payload: CategoryPayload) => Promise<CategoryFormErrors | null>;
}

function CategoryFormDialog({
  isOpen,
  editingCategory,
  onOpenChange,
  onSubmit,
}: CategoryFormDialogProps) {
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
    setValues({
      label: editingCategory?.label ?? '',
      slug: editingCategory?.slug ?? '',
      description: editingCategory?.description ?? '',
    });
    setErrors({});
    setIsSlugEdited(editingCategory !== null);
    setIsSubmitting(false);
  }, [isOpen, editingCategory]);

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

  const handleSlugChange = (slug: string) => {
    setIsSlugEdited(true);
    setValues((current) => ({ ...current, slug }));
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    const validationErrors = validateCategoryForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      focusFirstError(validationErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    const serverErrors = await onSubmit({
      slug: values.slug,
      label: values.label.trim(),
      description: values.description.trim(),
    }).finally(() => setIsSubmitting(false));
    if (serverErrors) {
      setErrors(serverErrors);
      focusFirstError(serverErrors);
      return;
    }
    onOpenChange(false);
  };

  const slugPatternInvalid = values.slug.length > 0 && !SLUG_PATTERN.test(values.slug);
  const labelErrorText = errors.label;
  const slugErrorText = errors.slug ?? (slugPatternInvalid ? SLUG_FORMAT_MESSAGE : undefined);
  const descriptionErrorText = errors.description;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogSurface>
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            {editingCategory ? 'Edit category' : 'Add category'}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {editingCategory
              ? 'Update the name, slug, and description for this category.'
              : 'Create a topic so posts can be grouped and linked across the site.'}
          </DialogPrimitive.Description>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="category-label">Name</Label>
            <Input
              id="category-label"
              ref={labelRef}
              value={values.label}
              onChange={(event) => handleLabelChange(event.target.value)}
              maxLength={60}
              autoComplete="off"
              aria-invalid={Boolean(labelErrorText)}
              aria-describedby={labelErrorText ? 'category-label-error' : undefined}
              placeholder="Desk setup"
            />
            {labelErrorText ? (
              <p id="category-label-error" className="text-sm text-destructive">
                {labelErrorText}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="category-slug">Slug</Label>
            <Input
              id="category-slug"
              ref={slugRef}
              value={values.slug}
              onChange={(event) => handleSlugChange(event.target.value)}
              maxLength={60}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={Boolean(slugErrorText)}
              aria-describedby={
                slugErrorText
                  ? 'category-slug-error category-slug-preview'
                  : 'category-slug-preview'
              }
              placeholder="desk-setup"
            />
            <p id="category-slug-preview" className="text-xs text-muted-foreground">
              URL preview:{' '}
              <span className="font-mono text-foreground">
                /tag/{values.slug || 'category-slug'}/
              </span>
            </p>
            {slugErrorText ? (
              <p id="category-slug-error" className="text-sm text-destructive">
                {slugErrorText}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="category-description">Description</Label>
              <span
                id="category-description-count"
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
              id="category-description"
              ref={descriptionRef}
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              aria-invalid={Boolean(descriptionErrorText)}
              aria-describedby={
                descriptionErrorText
                  ? 'category-description-error category-description-count'
                  : 'category-description-count'
              }
              placeholder="A short summary of what this topic covers."
              className="min-h-20 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
            />
            {descriptionErrorText ? (
              <p id="category-description-error" className="text-sm text-destructive">
                {descriptionErrorText}
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
              {editingCategory
                ? isSubmitting
                  ? 'Saving...'
                  : 'Save changes'
                : isSubmitting
                  ? 'Creating...'
                  : 'Create category'}
            </Button>
          </div>
        </form>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

interface DeleteCategoryDialogProps {
  category: CategoryRecord | null;
  isDeleting: boolean;
  errorMessage: string | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
}

function DeleteCategoryDialog({
  category,
  isDeleting,
  errorMessage,
  onOpenChange,
  onConfirm,
}: DeleteCategoryDialogProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (isDeleting) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <DialogPrimitive.Root open={category !== null} onOpenChange={handleOpenChange}>
      <DialogSurface>
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Delete category
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {category
              ? `Delete ${category.label}? It will be removed from the site and cannot be restored.`
              : 'Confirm the removal of this category.'}
          </DialogPrimitive.Description>
        </div>

        {category && category.postCount > 0 ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {category.postCount} {category.postCount === 1 ? 'post' : 'posts'} still reference this
            category. Reassign them before deleting.
          </p>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="whitespace-nowrap"
          >
            {isDeleting ? 'Deleting...' : 'Delete category'}
          </Button>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

export default function CategoryManager() {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const openCreateDialog = () => {
    setEditingCategory(null);
    setIsFormOpen(true);
  };

  const openEditDialog = (category: CategoryRecord) => {
    setEditingCategory(category);
    setIsFormOpen(true);
  };

  const handleFormOpenChange = (isOpen: boolean) => {
    setIsFormOpen(isOpen);
    if (!isOpen) {
      setEditingCategory(null);
    }
  };

  const handleFormSubmit = async (payload: CategoryPayload): Promise<CategoryFormErrors | null> => {
    const target = editingCategory;
    const targetSlug = target?.slug ?? null;

    try {
      const response = await requestJson<{ category: CategoryPayload }>(
        targetSlug
          ? `${CATEGORIES_ENDPOINT}/${encodeURIComponent(targetSlug)}`
          : CATEGORIES_ENDPOINT,
        { method: targetSlug ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      );

      setCategories((current) =>
        targetSlug
          ? current.map((categoryItem) =>
              categoryItem.slug === targetSlug
                ? { ...response.category, postCount: categoryItem.postCount }
                : categoryItem,
            )
          : [...current, { ...response.category, postCount: 0 }],
      );

      toast.success(
        targetSlug ? `Updated ${response.category.label}.` : `Created ${response.category.label}.`,
      );
      return null;
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'CATEGORY_EXISTS') {
        toast.error(error.message);
        return { slug: error.message };
      }
      const message = toErrorMessage(error);
      toast.error(message);
      return { form: message };
    }
  };

  const openDeleteDialog = (category: CategoryRecord) => {
    setDeleteError(null);
    setCategoryToDelete(category);
  };

  const handleDeleteOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setCategoryToDelete(null);
      setDeleteError(null);
    }
  };

  const handleDelete = async () => {
    const target = categoryToDelete;
    if (!target || isDeleting) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await requestJson<{ slug: string; deleted: boolean }>(
        `${CATEGORIES_ENDPOINT}/${encodeURIComponent(target.slug)}`,
        { method: 'DELETE' },
      );
      setCategories((current) =>
        current.filter((categoryItem) => categoryItem.slug !== target.slug),
      );
      toast.success(`Deleted ${target.label}.`);
      setCategoryToDelete(null);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'CATEGORY_IN_USE') {
        setDeleteError(
          'This category still has posts. Reassign them to another category, then delete this one.',
        );
        toast.error('This category still has posts.');
      } else {
        const message = toErrorMessage(error);
        setDeleteError(message);
        toast.error(message);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const renderPanel = () => {
    if (status === 'loading') {
      return <CategoryTableSkeleton />;
    }

    if (status === 'error') {
      return (
        <div className="flex flex-col items-start gap-3 px-6 py-12">
          <p className="text-sm font-medium text-foreground">Could not load categories.</p>
          <p className="max-w-prose text-sm text-muted-foreground">{loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadCategories()}>
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      );
    }

    if (categories.length === 0) {
      return (
        <div className="flex flex-col items-start gap-2 px-6 py-12">
          <p className="text-sm font-medium text-foreground">No categories yet.</p>
          <p className="max-w-prose text-sm text-muted-foreground">
            Add your first category to start grouping posts by topic.
          </p>
          <Button type="button" size="sm" onClick={openCreateDialog}>
            <PlusIcon />
            Add category
          </Button>
        </div>
      );
    }

    return (
      <CategoryTable
        categories={categories}
        onEditCategory={openEditDialog}
        onDeleteCategory={openDeleteDialog}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Categories
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Manage the topics used across the site. Each slug becomes a topic URL.
          </p>
        </div>
        <Button type="button" onClick={openCreateDialog} className="whitespace-nowrap">
          <PlusIcon />
          Add category
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">{renderPanel()}</div>

      <CategoryFormDialog
        isOpen={isFormOpen}
        editingCategory={editingCategory}
        onOpenChange={handleFormOpenChange}
        onSubmit={handleFormSubmit}
      />

      <DeleteCategoryDialog
        category={categoryToDelete}
        isDeleting={isDeleting}
        errorMessage={deleteError}
        onOpenChange={handleDeleteOpenChange}
        onConfirm={handleDelete}
      />
    </div>
  );
}
