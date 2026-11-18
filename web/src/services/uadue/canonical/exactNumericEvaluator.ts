/**
 * UADUE Phase 2D-5 — Exact Numeric & NAT Evaluation Engine
 * Document Version: 5.3.0-EXACT-REPRESENTATION
 *
 * Implements:
 * 1. Exact Decimal and Rational representations without JavaScript IEEE-754 floating-point truth.
 * 2. Fail-closed syntax classification pipeline.
 * 3. Exact rational comparison using BigInt arithmetic (zero floating-point precision loss).
 * 4. Safe bounded and large exponent handling without IEEE-754 overflow.
 */

import { ExactNumericRepresentation } from './types';

export const MAX_NUMERIC_DIGITS = 1000;
export const MAX_EXPONENT_MAGNITUDE = 1000n;

export interface ParseNumericResult {
  isSuccess: boolean;
  parsedRepresentation?: ExactNumericRepresentation;
  errorCode?: string;
  errorMessage?: string;
  rawInput: string;
}

/**
 * Computes Greatest Common Divisor using Euclidean algorithm on BigInt.
 */
function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Normalizes rational p/q into irreducible canonical form with q > 0.
 */
export function normalizeRational(p: bigint, q: bigint): { numerator: string; denominator: string } {
  if (q === 0n) {
    throw new Error('Denominator cannot be zero in exact rational representation');
  }
  let num = p;
  let den = q;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const divisor = gcd(num, den);
  num /= divisor;
  den /= divisor;
  return {
    numerator: num.toString(),
    denominator: den.toString(),
  };
}

/**
 * Converts an ExactNumericRepresentation into an exact BigInt rational (numerator / denominator).
 */
export function toBigIntRational(rep: ExactNumericRepresentation): { num: bigint; den: bigint } {
  if (rep.format === 'EXACT_RATIONAL') {
    if (rep.numerator.length > MAX_NUMERIC_DIGITS || rep.denominator.length > MAX_NUMERIC_DIGITS) {
      throw new Error(`Rational length exceeds maximum limit of ${MAX_NUMERIC_DIGITS} digits`);
    }
    return { num: BigInt(rep.numerator), den: BigInt(rep.denominator) };
  }

  if (rep.format === 'EXACT_DECIMAL') {
    if (rep.coefficientDigits.length > MAX_NUMERIC_DIGITS) {
      throw new Error(`Coefficient digits length exceeds maximum limit of ${MAX_NUMERIC_DIGITS} digits`);
    }
    const rawCoeff = BigInt(rep.coefficientDigits);
    const coeff = rep.sign === '-' ? -rawCoeff : rawCoeff;
    const exp = BigInt(rep.exponent);
    const absExp = exp < 0n ? -exp : exp;
    if (absExp > MAX_EXPONENT_MAGNITUDE) {
      throw new Error(`Exponent magnitude ${absExp} exceeds maximum limit of ${MAX_EXPONENT_MAGNITUDE}`);
    }

    if (exp >= 0n) {
      // coeff * 10^exp / 1
      const multiplier = 10n ** exp;
      return { num: coeff * multiplier, den: 1n };
    } else {
      // coeff / 10^(-exp)
      const divisor = 10n ** (-exp);
      return { num: coeff, den: divisor };
    }
  }

  throw new Error(`Interval format cannot be converted to a single rational: ${rep.format}`);
}

/**
 * Classifies raw string input and parses into ExactNumericRepresentation.
 * FAILS CLOSED on ambiguous locale syntax (e.g. comma as decimal vs thousand separator).
 */
export function parseExactNumericInput(
  rawInput: string,
  options?: { allowFractions?: boolean }
): ParseNumericResult {
  const trimmed = rawInput.trim();

  if (trimmed === '') {
    return {
      isSuccess: false,
      errorCode: 'EMPTY_INPUT',
      errorMessage: 'Numeric input is empty',
      rawInput,
    };
  }

  if (trimmed.length > MAX_NUMERIC_DIGITS) {
    return {
      isSuccess: false,
      errorCode: 'EXCEEDS_MAX_NUMERIC_MAGNITUDE',
      errorMessage: `Numeric input length (${trimmed.length}) exceeds maximum limit (${MAX_NUMERIC_DIGITS})`,
      rawInput,
    };
  }

  // 1. Check for numeric interval: e.g. "[12.5, 13.0]" or "(12.5, 13.0)"
  const intervalMatch = trimmed.match(/^([\[\(])\s*([^\s,]+)\s*(?:,\s*|\s+to\s+)\s*([^\s,\]\)]+)\s*([\]\)])$/);
  if (intervalMatch) {
    const leftBracket = intervalMatch[1];
    const lowStr = intervalMatch[2];
    const highStr = intervalMatch[3];
    const rightBracket = intervalMatch[4];

    const lowParsed = parseExactNumericInput(lowStr, options);
    const highParsed = parseExactNumericInput(highStr, options);

    if (!lowParsed.isSuccess || !highParsed.isSuccess || !lowParsed.parsedRepresentation || !highParsed.parsedRepresentation) {
      return {
        isSuccess: false,
        errorCode: 'INVALID_INTERVAL_ENDPOINTS',
        errorMessage: `Failed to parse endpoints in interval '${trimmed}'`,
        rawInput,
      };
    }

    return {
      isSuccess: true,
      parsedRepresentation: {
        format: 'NUMERIC_INTERVAL',
        lowEndpoint: lowParsed.parsedRepresentation,
        highEndpoint: highParsed.parsedRepresentation,
        isLowInclusive: leftBracket === '[',
        isHighInclusive: rightBracket === ']',
        rawSourceString: trimmed,
      },
      rawInput,
    };
  }

  // 2. Detect ambiguous comma syntax in numeric literal
  if (trimmed.includes(',')) {
    return {
      isSuccess: false,
      errorCode: 'UNRESOLVED_OR_AMBIGUOUS_NUMERIC_SYNTAX',
      errorMessage: `Input '${trimmed}' contains ambiguous comma separator; rejected under fail-closed contract`,
      rawInput,
    };
  }


  // 3. Check for rational fraction: e.g. "1/4", "-22/7"
  if (trimmed.includes('/')) {
    if (!options?.allowFractions) {
      return {
        isSuccess: false,
        errorCode: 'FRACTIONS_NOT_PERMITTED',
        errorMessage: `Fraction syntax '${trimmed}' not permitted by policy configuration`,
        rawInput,
      };
    }

    const fractionMatch = trimmed.match(/^([+-]?\d+)\s*\/\s*(\d+)$/);
    if (!fractionMatch) {
      return {
        isSuccess: false,
        errorCode: 'UNRESOLVED_OR_AMBIGUOUS_NUMERIC_SYNTAX',
        errorMessage: `Malformed fraction syntax '${trimmed}'`,
        rawInput,
      };
    }

    const numPart = fractionMatch[1].replace(/^[+-]/, '');
    const denPart = fractionMatch[2];
    if (numPart.length > MAX_NUMERIC_DIGITS || denPart.length > MAX_NUMERIC_DIGITS) {
      return {
        isSuccess: false,
        errorCode: 'EXCEEDS_MAX_NUMERIC_MAGNITUDE',
        errorMessage: `Fraction component length exceeds maximum limit (${MAX_NUMERIC_DIGITS})`,
        rawInput,
      };
    }

    const p = BigInt(fractionMatch[1]);
    const q = BigInt(fractionMatch[2]);
    if (q === 0n) {
      return {
        isSuccess: false,
        errorCode: 'DIVISION_BY_ZERO',
        errorMessage: 'Denominator cannot be zero in fraction',
        rawInput,
      };
    }

    const canonical = normalizeRational(p, q);
    return {
      isSuccess: true,
      parsedRepresentation: {
        format: 'EXACT_RATIONAL',
        numerator: canonical.numerator,
        denominator: canonical.denominator,
        rawSourceString: trimmed,
      },
      rawInput,
    };
  }

  // 4. Check for standard decimal or scientific notation: e.g. "12.34", "-0.05", "1.5e-3", "42"
  const decimalMatch = trimmed.match(/^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!decimalMatch) {
    return {
      isSuccess: false,
      errorCode: 'UNRESOLVED_OR_AMBIGUOUS_NUMERIC_SYNTAX',
      errorMessage: `String '${trimmed}' does not match unambiguous decimal representation`,
      rawInput,
    };
  }

  const sign = decimalMatch[1] === '-' ? '-' : '+';
  const integerPart = decimalMatch[2];
  const fractionalPart = decimalMatch[3] || '';
  const exponentStr = decimalMatch[4] || '0';

  if (integerPart.length + fractionalPart.length > MAX_NUMERIC_DIGITS) {
    return {
      isSuccess: false,
      errorCode: 'EXCEEDS_MAX_NUMERIC_MAGNITUDE',
      errorMessage: `Decimal digit count exceeds maximum limit (${MAX_NUMERIC_DIGITS})`,
      rawInput,
    };
  }

  const expBig = BigInt(exponentStr);
  const absExp = expBig < 0n ? -expBig : expBig;
  if (absExp > MAX_EXPONENT_MAGNITUDE) {
    return {
      isSuccess: false,
      errorCode: 'EXCEEDS_MAX_NUMERIC_MAGNITUDE',
      errorMessage: `Numeric exponent magnitude (${absExp}) exceeds maximum limit (${MAX_EXPONENT_MAGNITUDE})`,
      rawInput,
    };
  }

  // Compute exact coefficient and exponent
  // e.g. "12.34" => integerPart="12", fractionalPart="34", combined="1234", exponent = -2
  // Strip leading zeros on combined digits, but keep at least '0'
  const combinedDigits = (integerPart + fractionalPart).replace(/^0+/, '') || '0';
  const decimalPlaces = fractionalPart.length;
  const baseExponent = BigInt(exponentStr) - BigInt(decimalPlaces);

  return {
    isSuccess: true,
    parsedRepresentation: {
      format: 'EXACT_DECIMAL',
      sign,
      coefficientDigits: combinedDigits,
      exponent: baseExponent.toString(),
      rawSourceString: trimmed,
    },
    rawInput,
  };
}

/**
 * Checks whether user numeric input strictly matches the target representation.
 * Performs exact BigInt arithmetic.
 */
export function evaluateExactNumericMatch(
  userRep: ExactNumericRepresentation,
  targetRep: ExactNumericRepresentation,
  toleranceConfig?: {
    absoluteTolerance?: string;
    relativeTolerancePercent?: string;
    boundsInclusivity?: 'INCLUSIVE' | 'EXCLUSIVE';
  }
): { isMatch: boolean; details: string } {
  try {
    // Case A: Target is an interval
    if (targetRep.format === 'NUMERIC_INTERVAL') {
      if (userRep.format === 'NUMERIC_INTERVAL') {
        return { isMatch: false, details: 'User input cannot be an interval against target interval' };
      }

      const userRational = toBigIntRational(userRep);
      const lowRational = toBigIntRational(targetRep.lowEndpoint);
      const highRational = toBigIntRational(targetRep.highEndpoint);

      // low <= user <=> low.num * user.den <= user.num * low.den
      const lowComp = lowRational.num * userRational.den - userRational.num * lowRational.den;
      const highComp = userRational.num * highRational.den - highRational.num * userRational.den;

      const satisfiesLow = targetRep.isLowInclusive ? lowComp <= 0n : lowComp < 0n;
      const satisfiesHigh = targetRep.isHighInclusive ? highComp <= 0n : highComp < 0n;

      const isInside = satisfiesLow && satisfiesHigh;
      return {
        isMatch: isInside,
        details: isInside
          ? `Value ${userRep.rawSourceString} falls within target interval ${targetRep.rawSourceString}`
          : `Value ${userRep.rawSourceString} outside target interval ${targetRep.rawSourceString}`,
      };
    }

    // Case B: Direct exact comparison or tolerance comparison
    const userRat = toBigIntRational(userRep);
    const targetRat = toBigIntRational(targetRep);

    // Difference: |userRat - targetRat| = |(user.num * target.den - target.num * user.den) / (user.den * target.den)|
    const diffNum = userRat.num * targetRat.den - targetRat.num * userRat.den;
    const absDiffNum = diffNum < 0n ? -diffNum : diffNum;
    const commonDen = userRat.den * targetRat.den;

    // Exact match
    if (absDiffNum === 0n) {
      return { isMatch: true, details: `Exact numeric equality between ${userRep.rawSourceString} and ${targetRep.rawSourceString}` };
    }

    // Tolerance check if configured
    if (toleranceConfig?.absoluteTolerance || toleranceConfig?.relativeTolerancePercent) {
      if (!toleranceConfig.boundsInclusivity) {
        return {
          isMatch: false,
          details: 'Missing mandatory boundsInclusivity in tolerance configuration; fails closed',
        };
      }
    }

    if (toleranceConfig?.absoluteTolerance) {
      const absTolParsed = parseExactNumericInput(toleranceConfig.absoluteTolerance);
      if (absTolParsed.isSuccess && absTolParsed.parsedRepresentation) {
        const tolRat = toBigIntRational(absTolParsed.parsedRepresentation);
        // |diff| <= tol <=> absDiffNum * tol.den <= tol.num * commonDen
        const isWithinAbsTol =
          toleranceConfig.boundsInclusivity === 'INCLUSIVE'
            ? absDiffNum * tolRat.den <= tolRat.num * commonDen
            : absDiffNum * tolRat.den < tolRat.num * commonDen;
        if (isWithinAbsTol) {
          return { isMatch: true, details: `Value within absolute tolerance ${toleranceConfig.absoluteTolerance}` };
        }
      }
    }

    if (toleranceConfig?.relativeTolerancePercent) {
      const relTolParsed = parseExactNumericInput(toleranceConfig.relativeTolerancePercent);
      if (relTolParsed.isSuccess && relTolParsed.parsedRepresentation) {
        // relative tol percent: |diff| / |target| <= percent / 100
        const relRat = toBigIntRational(relTolParsed.parsedRepresentation);
        const absTargetNum = targetRat.num < 0n ? -targetRat.num : targetRat.num;
        if (absTargetNum > 0n) {
          // absDiffNum / (user.den * target.den) <= (rel.num / (rel.den * 100)) * (target.num / target.den)
          // absDiffNum * rel.den * 100 * target.den <= rel.num * absTargetNum * user.den * target.den
          // Cancelling target.den: absDiffNum * rel.den * 100 <= rel.num * absTargetNum * user.den
          const leftSide = absDiffNum * relRat.den * 100n;
          const rightSide = relRat.num * absTargetNum * userRat.den;
          const isWithinRelTol =
            toleranceConfig.boundsInclusivity === 'INCLUSIVE'
              ? leftSide <= rightSide
              : leftSide < rightSide;
          if (isWithinRelTol) {
            return { isMatch: true, details: `Value within relative tolerance ${toleranceConfig.relativeTolerancePercent}%` };
          }
        }
      }
    }

    return {
      isMatch: false,
      details: `Value ${userRep.rawSourceString} does not match target ${targetRep.rawSourceString}`,
    };
  } catch (err: unknown) {
    return {
      isMatch: false,
      details: `Evaluation failed due to numeric bounds limit: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
