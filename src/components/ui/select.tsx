import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn("select-control min-w-0", className)}
      {...props}
    />
  )
}

export { Select }
