/** a really simplistic default hash function */
function djb2Hash(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++)
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    return hash;
}

module.exports = {
  // maps URI schemes to stream implementations
  streams: {},
  // the default host
  localhost: undefined,
  // whether multiple hosts are allowed in one process
  // (that is mostly useful for testing)
  multihost: false,
  // hash function used for consistent hashing
  hashfn: djb2Hash,

  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: undefined
};
