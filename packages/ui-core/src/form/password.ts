/**
 * Password strength analysis - Framework agnostic
 */

export type PasswordStrengthLevel = 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';

export interface PasswordStrengthResult {
  level: PasswordStrengthLevel;
  score: number;
  label: string;
  color: string;
}

interface PasswordCriteria {
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasNumbers: boolean;
  hasSpecial: boolean;
  length: number;
}

/**
 * Analyze password criteria
 */
function analyzeCriteria(password: string): PasswordCriteria {
  return {
    hasLowercase: /[a-z]/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasNumbers: /\d/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    length: password.length,
  };
}

/**
 * Calculate password score (0-100)
 */
function calculateScore(criteria: PasswordCriteria): number {
  let score = 0;

  // Length scoring
  if (criteria.length >= 8) score += 20;
  if (criteria.length >= 12) score += 10;
  if (criteria.length >= 16) score += 10;

  // Character diversity
  if (criteria.hasLowercase) score += 15;
  if (criteria.hasUppercase) score += 15;
  if (criteria.hasNumbers) score += 15;
  if (criteria.hasSpecial) score += 15;

  return Math.min(100, score);
}

/**
 * Get strength level from score
 */
function getLevel(score: number): PasswordStrengthLevel {
  if (score < 20) return 'weak';
  if (score < 40) return 'fair';
  if (score < 60) return 'good';
  if (score < 80) return 'strong';
  return 'very-strong';
}

/**
 * Get display label for level
 */
function getLabel(level: PasswordStrengthLevel): string {
  const labels: Record<PasswordStrengthLevel, string> = {
    weak: '弱',
    fair: '一般',
    good: '良好',
    strong: '强',
    'very-strong': '非常强',
  };
  return labels[level];
}

/**
 * Get color for level
 */
function getColor(level: PasswordStrengthLevel): string {
  const colors: Record<PasswordStrengthLevel, string> = {
    weak: '#f44336',
    fair: '#ff9800',
    good: '#ffeb3b',
    strong: '#8bc34a',
    'very-strong': '#4caf50',
  };
  return colors[level];
}

export interface PasswordStrengthStore {
  analyze: (password: string) => PasswordStrengthResult;
}

/**
 * Create a password strength analyzer
 */
export function createPasswordStrength(): PasswordStrengthStore {
  return {
    analyze: (password: string): PasswordStrengthResult => {
      if (!password) {
        return {
          level: 'weak',
          score: 0,
          label: '弱',
          color: '#f44336',
        };
      }

      const criteria = analyzeCriteria(password);
      const score = calculateScore(criteria);
      const level = getLevel(score);

      return {
        level,
        score,
        label: getLabel(level),
        color: getColor(level),
      };
    },
  };
}

/**
 * Generate a cryptographically secure random integer between 0 (inclusive) and max (exclusive)
 */
function getSecureRandomInt(max: number): number {
  if (max <= 0) return 0;

  // Try to use Web Crypto API if available
  const cryptoObj =
    typeof globalThis !== 'undefined' && globalThis.crypto
      ? globalThis.crypto
      : typeof crypto !== 'undefined'
        ? crypto
        : null;

  if (cryptoObj?.getRandomValues) {
    const randomBuffer = new Uint32Array(1);
    const maxUint32 = 0xffffffff;

    // Avoid modulo bias
    const limit = maxUint32 - (maxUint32 % max);

    let randomValue;
    do {
      cryptoObj.getRandomValues(randomBuffer);
      randomValue = randomBuffer[0];
    } while (randomValue >= limit);

    return randomValue % max;
  }

  // Fallback
  console.warn('Crypto.getRandomValues is not available, falling back to insecure Math.random()');
  return Math.floor(Math.random() * max);
}

/**
 * Cryptographically secure array shuffle (Fisher-Yates)
 */
function secureShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate a random password
 */
export function generatePassword(length = 16): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*';

  const allChars = lowercase + uppercase + numbers + special;

  // Ensure at least one of each type
  let password = '';
  password += lowercase[getSecureRandomInt(lowercase.length)];
  password += uppercase[getSecureRandomInt(uppercase.length)];
  password += numbers[getSecureRandomInt(numbers.length)];
  password += special[getSecureRandomInt(special.length)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[getSecureRandomInt(allChars.length)];
  }

  // Shuffle the password
  return secureShuffle(password.split('')).join('');
}

/**
 * Generate a memorable passphrase
 */
export function generatePassphrase(wordCount = 4, separator = '-'): string {
  const words = [
    'apple',
    'banana',
    'cherry',
    'dragon',
    'eagle',
    'forest',
    'garden',
    'harbor',
    'island',
    'jungle',
    'knight',
    'lemon',
    'mango',
    'noble',
    'orange',
    'palace',
    'quest',
    'river',
    'sunset',
    'tiger',
    'unicorn',
    'voyage',
    'wizard',
    'zenith',
    'anchor',
    'bridge',
    'castle',
    'diamond',
    'ember',
    'falcon',
    'glacier',
    'horizon',
    'ivory',
    'jasmine',
    'kindle',
    'lunar',
    'meadow',
    'nebula',
    'orchid',
    'phoenix',
    'quartz',
    'rainbow',
    'silver',
    'thunder',
    'umbrella',
    'velvet',
    'willow',
    'crystal',
  ];

  const passphrase: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const randomWord = words[getSecureRandomInt(words.length)];
    // Capitalize first letter for readability
    passphrase.push(randomWord.charAt(0).toUpperCase() + randomWord.slice(1));
  }

  // Add a random number at the end for extra security
  const randomNumber = getSecureRandomInt(100);
  return passphrase.join(separator) + separator + randomNumber;
}
