import { createContext, useContext, useId } from 'react'
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

/** Id del control que envuelve el <Field> actual, para enlazar la etiqueta con él. */
const FieldIdContext = createContext<string | undefined>(undefined)

const control =
  'w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const idCampo = useContext(FieldIdContext)
  return <input ref={ref} id={idCampo} className={cn(control, 'h-9.5', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const idCampo = useContext(FieldIdContext)
  return <textarea id={idCampo} className={cn(control, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const idCampo = useContext(FieldIdContext)
  return <select id={idCampo} className={cn(control, 'h-9.5 pr-8', className)} {...props} />
}

/** Label + control + mensaje de ayuda o advertencia. */
export function Field({
  label,
  hint,
  warning,
  className,
  children,
}: {
  label?: string
  hint?: string
  warning?: string
  className?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <FieldIdContext.Provider value={id}>{children}</FieldIdContext.Provider>
      {warning ? (
        <p className="mt-1 text-xs text-warning">{warning}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
