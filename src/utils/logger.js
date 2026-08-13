function formatLog(level, operation, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const log = {
    timestamp,
    level,
    operation,
    message,
    ...meta
  };
  return JSON.stringify(log);
}

function info(operation, message, meta) {
  console.log(formatLog('info', operation, message, meta));
}

function warn(operation, message, meta) {
  console.warn(formatLog('warn', operation, message, meta));
}

function error(operation, message, meta) {
  console.error(formatLog('error', operation, message, meta));
}

module.exports = {
  info,
  warn,
  error
};
