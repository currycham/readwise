// 极简命令行参数解析：位置参数 + --key value / --flag
export function parseArgs(argv = process.argv.slice(2)) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) opt[k] = true;
      else { opt[k] = v; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}
