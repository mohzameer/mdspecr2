#!/usr/bin/env node
import { Command } from 'commander'
import { publishCommand } from './commands/publish.js'

const program = new Command()

program
  .name('mdspec')
  .description('CI-first spec publishing CLI')
  .version('0.1.0')

program
  .command('publish')
  .description('Publish spec files to mdspec')
  .requiredOption('--project <project_id>', 'Project ID')
  .option('--base <base_ref>', 'Base git ref for change detection (default: origin/main)')
  .option('--dirs <dirs>', 'Comma-separated spec directories (overrides project config)')
  .action(publishCommand)

program.parseAsync(process.argv)
