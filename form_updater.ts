#!/usr/bin/env node
import * as fs from 'fs';
import minimist from 'minimist';
import * as formatter from './formatter.js';

const opts = {
  string: ['delete', 'update']
};

export function formUpdaterUsage() {
  console.log(`Usage:
./dist/aqua.js   form_updater <file_to_change.aqua.json> --option

Options:
  --delete <forms key>    Remove the value for the key and mark it as deleted
  --update <forms key> <content>  Update or restore the forms field with new content

Examples:
  ./dist/aqua.js   form_updater example.aqua.json --delete forms-name
  ./dist/aqua.js   form_updater example.aqua.json --update forms-age 30
`);
}

function validateInput(filename_par: string): void {
  let filename = "";
  let filename_with_revision_hash = filename_par.split('@');
  
  if (filename_with_revision_hash.length > 1) {
    filename = filename_with_revision_hash[0];
  } else {
    filename = filename_par;
  }
  
  if (!filename.endsWith('.aqua.json')) {
    formatter.log_red('Error: File must be a .aqua.json file');
    process.exit(1);
  }
  
  if (!fs.existsSync(filename)) {
    formatter.log_red(`Error: File ${filename} does not exist`);
    process.exit(1);
  }
}

function findFormKey(aquaData: Record<string, any>, key: string): string | undefined {
  // Look for exact match or partial match with 'forms-' prefix
  const keys = Object.keys(aquaData);
  return keys.find(k => k === key || k === `forms_${key}` || k.startsWith(`forms_${key}`));
}

function updateForm(filename_par: string, key: string, content: string | undefined): void {
  let filename = "";
  let file_revision_hash = "";
  let filename_with_revision_hash = filename_par.split('@');
  
  if (filename_with_revision_hash.length > 1) {
    filename = filename_with_revision_hash[0];
    file_revision_hash = filename_with_revision_hash[1];
  } else {
    filename = filename_par;
  }
  
  const aquaData = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const revisions = aquaData.revisions;
  
  let targetRevisionHash = "";
  
  if (filename_with_revision_hash.length > 1) {
    for (let revisionKey in revisions) {
      if (revisionKey === file_revision_hash) {
        targetRevisionHash = revisionKey;
        break;
      }
    }
  } else {
    console.log('Using latest revision');
    targetRevisionHash = Object.keys(revisions).pop() ?? "";
  }
  
  const targetRevision = revisions[targetRevisionHash];
  
  if (targetRevisionHash === "" || targetRevision === undefined) {
    formatter.log_red('Error: Revision hash not found in file');
    process.exit(1);
  }
  
  const formKey = findFormKey(targetRevision, key);
  
  if (!formKey) {
    formatter.log_red(`Error: Form key '${key}' not found`);
    process.exit(1);
  }
  
  if (content === undefined) {
    // Delete operation - mark as deleted
    const deletedKey = `${formKey}.deleted`;
    let newRevision: Record<string, any> = {};
    
    for (let revisionKey in targetRevision) {
      if (formKey === revisionKey) {
        newRevision[deletedKey] = null;
      } else {
        newRevision[revisionKey] = targetRevision[revisionKey];
      }
    }
    
    revisions[targetRevisionHash] = newRevision;
    console.log(`Successfully deleted form key '${key}' from ${filename}`);
  } else {
    // Update operation
    if (formKey.endsWith('.deleted')) {
      // Restore deleted field
      const originalKey = formKey.replace('.deleted', '');
      let newRevision: Record<string, any> = {};
      
      for (let revisionKey in targetRevision) {
        if (formKey === revisionKey) {
          newRevision[originalKey] = content;
        } else {
          newRevision[revisionKey] = targetRevision[revisionKey];
        }
      }
      
      revisions[targetRevisionHash] = newRevision;
      console.log(`Successfully restored and updated form key '${originalKey}' in ${filename}`);
    } else {
      // Regular update
      targetRevision[formKey] = content;
      console.log(`Successfully updated form key '${key}' in ${filename}`);
    }
  }
  
  // Write updated data back to file with proper formatting
  const jsonString = JSON.stringify(aquaData, null, 2);
  fs.writeFileSync(filename, jsonString);
}

export async function runFormUpdater(argv: minimist.ParsedArgs): Promise<void> {
  if (argv._.length < 1 || (!argv.delete && !argv.update)) {
    formatter.log_red("ERROR: You must specify a filename and either --delete or --update option");
    formUpdaterUsage();
    process.exit(1);
  }
  
  const filename = argv._[0];
  validateInput(filename);
  
  if (argv.delete) {
    console.log('\nDeleting form key\n');
    updateForm(filename, argv.delete, undefined);
  } else if (argv.update) {
    console.log('\nUpdating form key\n');
    if (argv._.length < 2) {
      formatter.log_red('Error: Missing content for update');
      formUpdaterUsage();
      process.exit(1);
    }
    updateForm(filename, argv.update, argv._[1]);
  }
}

// For standalone usage
if (require.main === module) {
  const argv = minimist(process.argv.slice(2), opts);
  (async () => {
    await runFormUpdater(argv);
  })();
}