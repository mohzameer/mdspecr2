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
  .description('Publish markdown files with frontmatter (see docs/new-pivot.md)')
  .requiredOption('--project <project_id>', 'Project ID')
  .option('--all', 'Walk the repo and publish every file with frontmatter (ignores git diff)')
  .action(publishCommand)

program.parseAsync(process.argv)
