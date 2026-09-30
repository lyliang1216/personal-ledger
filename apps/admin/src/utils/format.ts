const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/

export const formatCurrency = (value: string): string => {
  const match = DECIMAL_PATTERN.exec(value.trim())
  if (!match) return '¥0.00'

  const [, sign, integerPart, fractionPart = ''] = match
  const roundedFraction = fractionPart.padEnd(3, '0')
  let integerValue = BigInt(integerPart)
  let centValue = BigInt(roundedFraction.slice(0, 2))

  if (roundedFraction[2] >= '5') centValue += 1n
  if (centValue === 100n) {
    integerValue += 1n
    centValue = 0n
  }

  const groupedInteger = integerValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const prefix = sign === '-' && (integerValue > 0n || centValue > 0n) ? '-' : ''
  return `${prefix}¥${groupedInteger}.${centValue.toString().padStart(2, '0')}`
}

export const formatPercentage = (value: string): string => `${value}%`

export const amountToChartValue = (value: string): number => {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}
