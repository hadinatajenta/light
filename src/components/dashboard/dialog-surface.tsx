import type { ComponentProps } from 'react';
import { DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function DialogSurface({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return <DialogContent className={cn('max-w-lg', className)} {...props} />;
}
