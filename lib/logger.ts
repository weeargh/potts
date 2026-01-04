/**
 * Structured logging utility for Potts-App
 * Provides consistent logging with log levels and structured metadata
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Get minimum log level from environment (default: info in production, debug in development)
const MIN_LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL]
}

/**
 * Format log entry as JSON for structured logging
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry)
}

/**
 * Output log entry to console (color-coded for development)
 */
function outputLog(entry: LogEntry): void {
  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment) {
    // Colored console output for development
    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    }
    const reset = '\x1b[0m'

    const color = colors[entry.level]
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
    const errorStr = entry.error ? `\n  ${entry.error.name}: ${entry.error.message}\n  ${entry.error.stack}` : ''

    console.log(
      `${color}[${entry.level.toUpperCase()}]${reset} ${entry.message}${contextStr}${errorStr}`
    )
  } else {
    // JSON output for production (for log aggregation services)
    console.log(formatLogEntry(entry))
  }
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  }

  if (context && Object.keys(context).length > 0) {
    entry.context = context
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return entry
}

/**
 * Logger class
 */
class Logger {
  private namespace?: string

  constructor(namespace?: string) {
    this.namespace = namespace
  }

  /**
   * Add namespace prefix to message
   */
  private withNamespace(message: string): string {
    return this.namespace ? `[${this.namespace}] ${message}` : message
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    if (!shouldLog('debug')) return

    const entry = createLogEntry('debug', this.withNamespace(message), context)
    outputLog(entry)
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    if (!shouldLog('info')) return

    const entry = createLogEntry('info', this.withNamespace(message), context)
    outputLog(entry)
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    if (!shouldLog('warn')) return

    const entry = createLogEntry('warn', this.withNamespace(message), context)
    outputLog(entry)
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, context?: LogContext): void {
    if (!shouldLog('error')) return

    const entry = createLogEntry('error', this.withNamespace(message), context, error)
    outputLog(entry)
  }

  /**
   * Create a child logger with a namespace
   */
  child(namespace: string): Logger {
    const childNamespace = this.namespace ? `${this.namespace}:${namespace}` : namespace
    return new Logger(childNamespace)
  }
}

// Export default logger instance
export const logger = new Logger()

// Export Logger class for creating namespaced loggers
export { Logger }

// Export type for log context
export type { LogContext }
