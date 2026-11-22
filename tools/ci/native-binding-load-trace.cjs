'use strict';

// Diagnostics only: identify which native N-API addon each Node process loads.
// The same preload is inherited by Nx workers and their child processes.
const dlopen = process.dlopen;
process.dlopen = function tracedDlopen(module, filename, ...args) {
  process.stderr.write('[native-load] pid=' + process.pid + ' module=' + String(filename) + '\n');
  return dlopen.call(this, module, filename, ...args);
};
