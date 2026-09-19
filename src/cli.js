#!/usr/bin/env node

const path = require('node:path');
const { loadConfig } = require('./index');
const { ConfigError } = require('./errors');

function usage() {
  console.error('用法: node src/cli.js <默认层> <环境层> <覆盖层> [键名]');
  process.exit(2);
}

function main(argv) {
  if (argv.length < 3 || argv.length > 4) {
    usage();
  }

  const paths = argv.slice(0, 3).map((item) => path.resolve(item));
  const key = argv[3] || null;

  try {
    const config = loadConfig(paths);
    if (key) {
      console.log(config.resolve(key));
    } else {
      for (const [name, value] of Object.entries(config.all())) {
        console.log(`${name}=${value}`);
      }
    }
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

main(process.argv.slice(2));
