#!/usr/bin/env node
import { Command } from 'commander'
import { publishCommand } from './commands/publish.js'

const program = new Command()

program
  .name('mdspec')
  .description('CI-first spec publishing CLI')
  .version('0.5.0')

program
  .command('publish')
  .description('Publish spec files to mdspec (reads .mdspecmap from repo root)')
  .requiredOption('--project <project_id>', 'Project ID')
  .option('--base <base_ref>', 'Base git ref for change detection')
  .option('--skip-diff', 'Skip git diff and publish all discovered specs')
  .action(publishCommand)

program
  .command('init')
  .description('Generate a starter .mdspecmap file')
  .requiredOption('--project <project_id>', 'Project ID')
  .action(async (options: { project: string }) => {
    const { initCommand } = await import('./commands/init.js')
    return initCommand(options)
  })

program.parseAsync(process.argv)
