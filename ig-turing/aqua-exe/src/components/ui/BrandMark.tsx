interface Props {
  className?: string
}

export function BrandMark({ className = '' }: Props) {
  return <img className={`brand-mark ${className}`.trim()} src="/images/callmemaybefont.png" alt="CallMeMaybe" />
}
