/** Full audits execute all projects, even when the diff only changed documentation. */
export function projectCommand(command, args, full) {
  if (
    full &&
    command === 'pnpm' &&
    args[0] === 'exec' &&
    args[1] === 'nx' &&
    args[2] === 'affected'
  ) {
    return { command, args: [...args.slice(0, 2), 'run-many', ...args.slice(3)] };
  }
  return { command, args };
}
