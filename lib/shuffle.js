const MersenneTwister = require("mersenne-twister");

function buildSeed() {
  const hi = (Date.now() & 0xffffffff) >>> 0;
  const lo = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return (hi ^ lo) >>> 0;
}

function shuffleMt19937(arr) {
  const mt = new MersenneTwister(buildSeed());
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(mt.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

module.exports = { shuffleMt19937 };
