#!/usr/bin/env node

import * as fs from "fs";
import minimist from "minimist";
import * as formatter from "./formatter.js";
import Aquafier, { printLogs } from "aqua-js-sdk";
// import * as main from "./index.js";

import {
  readCredentials,
  createGenesisRevision,
  serializeAquaTree,
  readAndCreateAquaTreeAndAquaTreeWrapper,
  revisionWithMultipleAquaChain
} from "./utils.js";
import { verifyAndGetGraphData, verifyAquaTreeData } from "./index.js";
import { runFormUpdater, formUpdaterUsage } from "./form_updater.js";

// Parse the command and subcommand structure
const mainCommand = process.argv[2];
const args = process.argv.slice(
  mainCommand === "notarize" || mainCommand === "verify" || mainCommand === "form_updater" ? 3 : 2
);

// Define options for both commands
const notarizeOpts = {
  boolean: ["v", "scalar", "rm", "graph", "content", "tree"],
  string: ["sign", "link", "witness", "cred", "form", "network", "type"],
};

const verifyOpts = {
  boolean: ["v", "m", "graph"],
  string: ["server", "api"],
};

const formUpdaterOpts = {
  string: ["delete", "update"],
};

// Main usage function
function usage() {
  console.log(`Usage:
./dist/aqua.js   [COMMAND] [OPTIONS] <filename>

Commands:
  notarize       Create or update an AQUA file for a document
  verify         Verify an AQUA file
  form_updater   Update or delete form fields in an AQUA file

For command-specific help:
  ./dist/aqua.js   notarize --help
  ./dist/aqua.js   verify --help
  ./dist/aqua.js   form_updater --help

Examples:
  ./dist/aqua.js   notarize README.md --tree
  ./dist/aqua.js   verify README.md
  ./dist/aqua.js   form_updater example.aqua.json --delete forms-name`);
}

// Notarize usage function
function notarizeUsage() {
  console.log(`Usage:
./dist/aqua.js   notarize [OPTIONS] <filename>
which generates filename.aqua.json

Options:
  --sign [cli|metamask|did]
    Sign with either of:
    1. the Ethereum seed phrase provided in mnemonic.txt
    2. MetaMask
    3. DID key
  --witness [eth|nostr|tsa]
    Witness with either of:
    1. Ethereum on-chain with MetaMask
    2. Nostr network
    3. TSA DigiCert
  --link <filename.aqua.json>
    Add a link to an AQUA chain as a dependency
  --scalar
    Use this flag to use a more lightweight, "scalar" aquafication.
    This is the default option.
  --tree
    Use this flag to use to create a verification tree.
    This option is slower than scalar but provides a better garantee.
  --content
    Use this flag to include the content file instead of just its hash and name
  --rm
    Remove the most recent revision of the AQUA file
  --v
    To print all the logs
  --form <json-file>
    Use this flag to include the json file with form data
  --network
    Use this flag to switch between 'mainnet' and 'sepolia' when witnessing
  --type 
    Use this flag to switch between metamask and cli wallet when witnessing 
  --graph 
    Use this flag to generate a graph of the aqua tree in the console/terminal
  --cred <credentials.json file>
    the file to read credentials from

Example :
  1. Notarize a file
     -> using --tree option to have verification hash leaves
      ./dist/aqua.js   notarize README.md --tree
     -> create a gensis revision tha is a form 
      ./dist/aqua.js   notarize README.md --form README.md

  2. Witness
    -> multple aqua trees using eth option  
      ./dist/aqua.js   notarize LICENSE,README.md --witness eth --tree --network sepolia

  3. Signing 
    -> using metemask 
      ./dist/aqua.js   notarize --sign metamask <FILE_PATH>
    -> using cli 
      ./dist/aqua.js   notarize --sign cli <FILE_PATH>

  4. Linking 
    -> Linking a single aqua tree to another single aqua tree 
      ./dist/aqua.js   notarize <FILE_PATH> --link <FILE_PATH>
    -> Linking a multiple aqua tree to another single aqua tree 
      ./dist/aqua.js   notarize <FILE_PATH>,<FILE_PATH> --link <FILE_PATH>
    -> Linking a single aqua tree to another multiple aqua tree 
      ./dist/aqua.js   notarize <FILE_PATH> --link <FILE_PATH>,<FILE_PATH>`);
}

// Verify usage function
function verifyUsage() {
  console.log(`Usage:
./dist/aqua.js   verify [OPTIONS] <file name>
or
./dist/aqua.js   verify [OPTIONS] --api <page title>

Options:
  -v                     Verbose
  --server               <The url of the server, e.g. https://pkc.inblock.io>
  --api                  (If present) The title to read from for the data
  --graph                To show the graph data
  
If the --server is not specified, it defaults to http://localhost:9352

Examples:
  ./dist/aqua.js   verify README.md
  ./dist/aqua.js   verify README.md --graph
  ./dist/aqua.js   verify --api "My Document" --server https://example.com`);
}

// Process help flags before other parsing
if (args.includes("--help") || args.includes("-h")) {
  if (mainCommand === "notarize") {
    notarizeUsage();
  } else if (mainCommand === "verify") {
    verifyUsage();
  } else if (mainCommand === "form_updater") {
    formUpdaterUsage();
  } else {
    usage();
  }
  process.exit(0);
}

// Handle different commands
async function main() {
   
  if (mainCommand === "notarize") {
    const argv = minimist(args, notarizeOpts);
    await runNotarize(argv);
  } else if (mainCommand === "verify") {
    const argv = minimist(args, verifyOpts);
    await runVerify(argv);

  } else if (mainCommand === "form_updater") {
    const argv = minimist(args, formUpdaterOpts);
    await runFormUpdater(argv);

  } else {
    // If no explicit command was provided, try to use the first arg as filename
    // and default to notarize
    const argv = minimist([...process.argv.slice(2)], notarizeOpts);
    if (argv._.length > 0) {
      await runNotarize(argv);
    } else {
      formatter.log_red("ERROR: No command or filename specified");
      usage();
      process.exit(1);
    }
  }
}


async function runNotarize(argv: minimist.ParsedArgs) {
  const filename = argv._[0];
  
  if (!filename) {
    formatter.log_red("ERROR: You must specify a file");
    notarizeUsage();
    process.exit(1);
  }

  const signMethod = argv["sign"];
  const enableSignature = !!signMethod;
  // all revisions are scalar by default other than the forms revisions
  // to reduce comput cost and time
  let enableScalar = argv["scalar"];
  let vTree = argv["tree"];
  const witnessMethod = argv["witness"];
  const enableWitness = !!witnessMethod;
  const enableContent = argv["content"];
  const enableVerbose = argv["v"];
  const enableRemoveRevision = argv["rm"];
  const linkURIs = argv["link"];
  const enableLink = !!linkURIs;
  const enableForm = argv["form"];
  let network = argv["network"];
  let witness_platform_type = argv["type"];
  let showGraph = argv["graph"];
  const credentialsFile = argv["cred"] || "credentials.json";

  let fileNameOnly = "";
  let revisionHashSpecified = "";
  let logs = [];

  if (filename.includes("@") && !filename.includes(",")) {
    const filenameParts = filename.split("@");
    if (filenameParts.length > 2) {
      formatter.log_red("-> Invalid filename format. Please use only one '@' symbol to separate the filename from the revision hash.");
      process.exit(1);
    }
    fileNameOnly = filenameParts[0];
    revisionHashSpecified = filenameParts[1];

    if (revisionHashSpecified.length == 0) {
      formatter.log_red("Revision hash is empty. Please provide a valid revision hash.");
      process.exit(1);
    }
  } else {
    if (filename.includes(".aqua.json")) {
      fileNameOnly = filename.replace(".aqua.json", "")
    } else {
      fileNameOnly = filename;
    }
  }

  const aquaFilename = fileNameOnly + ".aqua.json"
  if (!enableForm) {
    enableScalar = true;
  }
  if (vTree) {
    enableScalar = false;
  }

  let revisionType = "file";
  if (enableSignature) {
    revisionType = "signature";
  } else if (enableWitness) {
    revisionType = "witness";
  } else if (enableLink) {
    revisionType = "link";
  } else if (enableForm) {
    revisionType = "form";
    enableScalar = false;
  }

  // Instantiate the Aquafier class
  const aquafier = new Aquafier();

  if (filename.includes(",")) {
    if (revisionType == "witness" || revisionType == "link") {
      revisionWithMultipleAquaChain(revisionType, fileNameOnly, aquafier, linkURIs, enableVerbose, enableScalar, witness_platform_type, network, witnessMethod, signMethod);
      return;
    } else {
      console.log("❌ only revision type witness and link work with multiple aqua chain as the file name");
      process.exit(1);
    }
  }

  if (!fs.existsSync(aquaFilename)) {
    createGenesisRevision(aquaFilename, enableForm, enableScalar, enableContent, aquafier);
    return;
  }

  const aquaTree = JSON.parse(fs.readFileSync(aquaFilename, 'utf8'));

  if (!aquaTree) {
    formatter.log_red(`❌ Fatal Error! Aqua Tree does not exist`);
    createGenesisRevision(aquaFilename, enableForm, enableScalar, enableContent, aquafier);
    return;
  }

  const revisions = aquaTree.revisions;
  const verificationHashes = Object.keys(revisions);
  const lastRevisionHash = verificationHashes[verificationHashes.length - 1];

  if (showGraph) {
    console.log("Rendering the aqua tree\n");
    aquafier.renderTree(aquaTree);
    return;
  }

  if (enableRemoveRevision) {
    let result = aquafier.removeLastRevision(aquaTree);

    if (result.isOk()) {
      const resultData = result.data;
      if (resultData.aquaTree === null || !resultData.aquaTree) {
        try {
          fs.unlinkSync(aquaFilename);
        } catch (e) {
          console.log(`❌ Unable to delete file. ${e}`);
        }
      } else {
        serializeAquaTree(aquaFilename, resultData.aquaTree);
      }
    } else {
      console.log("❌ Unable to remove last revision");
    }
    return;
  }

  if (revisionHashSpecified.length > 0) {
    console.log("📍 Revision specified: ", revisionHashSpecified);

    if (!verificationHashes.includes(revisionHashSpecified)) {
      formatter.log_red(`❌ Revision hash ${revisionHashSpecified} not found in ${aquaFilename}`);
      process.exit(1);
    }
  } else {
    revisionHashSpecified = verificationHashes[verificationHashes.length - 1];
  }

  if (enableSignature && enableWitness) {
    formatter.log_red("❌ you cannot sign & witness at the same time");
    process.exit(1);
  }

  const creds = readCredentials(credentialsFile);
  const aquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(fileNameOnly, revisionHashSpecified);
  if (revisionType == "file") {
    let alreadyNotarized = aquafier.checkIfFileAlreadyNotarized(aquaTreeWrapper.aquaTree, aquaTreeWrapper.aquaTreeWrapper.fileObject);
    if (alreadyNotarized) {
      formatter.log_red(`❌ file ${fileNameOnly} has already been notarized`);
      process.exit(1);
    }
  }

  console.log("➡️  Revision type: ", revisionType);
  console.log(`➡️  Credential :  ${credentialsFile}  Data ${JSON.stringify(creds,null,4)}`, );

  if (enableContent) {
    const fileContent = fs.readFileSync(fileNameOnly, { encoding: "utf-8" });
    const _aquaObject = fs.readFileSync(aquaFilename, { encoding: "utf-8" });
    let fileObject = {
      fileName: fileNameOnly,
      fileContent: fileContent,
      path: "./"
    };

    let aquaTreeWrapper = {
      aquaTree: JSON.parse(_aquaObject),
      fileObject: fileObject,
      revision: "",
    };

    const aquaObjectResultForContent = await aquafier.createContentRevision(aquaTreeWrapper, fileObject, enableScalar);
    if (aquaObjectResultForContent.isOk()) {
      serializeAquaTree(aquaFilename, aquaObjectResultForContent.data.aquaTree!);
      logs.push(...aquaObjectResultForContent.data.logData);
    } else {
      let enableContentlogs = aquaObjectResultForContent.data;
      logs.push(...enableContentlogs);
    }

    printLogs(logs, enableVerbose);
    return;
  }

  if (enableForm) {
    if (!fs.existsSync(enableForm)) {
      formatter.log_red(`ERROR: The file ${enableForm} does not exist.`);
      process.exit(1);
    }

    const fileContent = fs.readFileSync(enableForm, { encoding: "utf-8" });

    try {
      const offlineData = JSON.parse(fileContent);
    } catch (e) {
      formatter.log_red(`ERROR: The form file ${enableForm} does not contain valid json.`);
      process.exit(1);
    }

    let fileObject = {
      fileName: enableForm,
      fileContent: fileContent,
      path: "./"
    };

    const aquaObjectResultForForm = await aquafier.createFormRevision(aquaTreeWrapper.aquaTreeWrapper, fileObject, enableScalar);
    if (aquaObjectResultForForm.isOk()) {
      serializeAquaTree(aquaFilename, aquaObjectResultForForm.data.aquaTree!);
      logs.push(...aquaObjectResultForForm.data.logData);
    } else {
      let enableContentlogs = aquaObjectResultForForm.data;
      logs.push(...enableContentlogs);
    }

    printLogs(logs, enableVerbose);
    return;
  }

  if (enableSignature) {
    let options_array = ["metamask", "cli", "did"];
    if (!options_array.includes(signMethod)) {
      console.log(`❌ An invalid sign method provided ${signMethod}.\n💡 Hint use on of ${options_array.join(",")}`);
      process.exit(1);
    }

    const signatureResult = await aquafier.signAquaTree(aquaTreeWrapper.aquaTreeWrapper, signMethod, creds, enableScalar);

    if (signatureResult.isOk()) {
      serializeAquaTree(aquaFilename, signatureResult.data.aquaTree!);
      let logs_result = signatureResult.data.logData;
      logs.push(...logs_result);
    } else {
      let logs_result = signatureResult.data;
      logs.push(...logs_result);
    }
    printLogs(logs, enableVerbose);
    return;
  }

  if (enableWitness) {
    if (witness_platform_type == undefined) {
      witness_platform_type = creds.witness_method;
      if (creds.witness_method == undefined || creds.witness_method.length == 0) {
        witness_platform_type = "eth";
      }
    }
    
    if (network == undefined) {
      network = creds.witness_eth_network;
      if (creds.witness_eth_network == undefined || creds.witness_eth_network.length == 0) {
        network = "sepolia";
      }
    }

    const witnessResult = await aquafier.witnessAquaTree(aquaTreeWrapper.aquaTreeWrapper, witnessMethod, network, witness_platform_type, creds, enableScalar);

    if (witnessResult.isOk()) {
      serializeAquaTree(aquaFilename, witnessResult.data.aquaTree!);
      let logs_result = witnessResult.data.logData;
      logs.push(...logs_result);
    } else {
      let logs_result = witnessResult.data;
      logs.push(...logs_result);
    }

    printLogs(logs, enableVerbose);
    return;
  }

  if (enableLink) {
    let linkResult = null;
    if (linkURIs.includes(",") && fileNameOnly.includes(",")) {
      console.log("➡️ Link many to many not allowed, specify either multiple link URI or multiple files but not both.");
      process.exit(1);
    } else if (linkURIs.includes(",") && !fileNameOnly.includes(",")) {
      let containsNameInLink = linkURIs.split(",").find((e:string) => e == fileNameOnly);
      if (containsNameInLink) {
        formatter.log_red("⛔ aqua file name also find in link, possible cyclic linking found");
        process.exit(1);
      }
      
      console.log("➡️ Linking an AquaTree to multiple AquaTrees");
      let linkAquaTreeWrappers: { aquaTree: any; fileObject: { fileName: string; fileContent: string; path: string }; revision: string }[] = []
    
      linkURIs.split(",").map((file : string) => {
        let _aquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(file, "").aquaTreeWrapper;
        linkAquaTreeWrappers.push(_aquaTreeWrapper);
      });
      
      let _singAquaTree = readAndCreateAquaTreeAndAquaTreeWrapper(fileNameOnly, revisionHashSpecified).aquaTreeWrapper;
      linkResult = await aquafier.linkAquaTreesToMultipleAquaTrees(_singAquaTree, linkAquaTreeWrappers, enableScalar);
    } else {
      let containsNameInLink = fileNameOnly.split(",").find((e) => e == linkURIs);
      if (containsNameInLink) {
        formatter.log_red("aqua file name also find in link, possible cyclic linking found");
        process.exit(1);
      }

      let aquaTreeWrappers = [];
      if (fileNameOnly.includes(",")) {
        console.log("✨ Linking multiple AquaTree to a single AquaTrees");
        fileNameOnly.split(",").map((file) => {
          let _aquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(file, "").aquaTreeWrapper;
          aquaTreeWrappers.push(_aquaTreeWrapper);
        });
      } else {
        let _singAquaTree = readAndCreateAquaTreeAndAquaTreeWrapper(fileNameOnly, revisionHashSpecified).aquaTreeWrapper;
        aquaTreeWrappers.push(_singAquaTree);
      }

      const linkAquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(linkURIs, revisionHashSpecified).aquaTreeWrapper;
      linkResult = await aquafier.linkMultipleAquaTrees(aquaTreeWrappers, linkAquaTreeWrapper, enableScalar);
    }
    
    if (linkResult == null) {
      formatter.log_red("A critical error occurred linking aquatrees");
      process.exit(1);
    }

    if (linkResult.isOk()) {
      const aquaTreesResults = linkResult.data;
      const aquaTrees = aquaTreesResults.aquaTrees;

      if (aquaTreesResults.aquaTree != null && aquaTreesResults.aquaTree != undefined) {
        let aquaTree = aquaTreesResults.aquaTree;
        const hashes = Object.keys(aquaTree.revisions);
        const aquaTreeFilename = aquaTree.file_index[hashes[0]];
        serializeAquaTree(`${aquaTreeFilename}.aqua.json`, aquaTree);
      }
      
      if (aquaTrees.length > 0) {
        for (let i = 0; i < aquaTrees.length; i++) {
          const aquaTree = aquaTrees[i];
          const hashes = Object.keys(aquaTree.revisions);
          const aquaTreeFilename = aquaTree.file_index[hashes[0]];
          serializeAquaTree(`${aquaTreeFilename}.aqua.json`, aquaTree);
        }
      }

      let logs_result = aquaTreesResults.logData;
      logs.push(...logs_result);
    } else {
      let logs_result = linkResult.data;
      logs.push(...logs_result);
    }

    printLogs(logs, enableVerbose);
    return;
  }
}

async function runVerify(argv :  any) {
  const verbose = argv.v;
  const server = argv.server ? argv.server : "http://localhost:9352";
  const credentialsFile = argv["cred"] || "credentials.json";
  
  if (argv._.length < 1 && !argv.api) {
    formatter.log_red("ERROR: You must specify the file name or page title (if --api)");
    verifyUsage();
    process.exit(1);
  }

  if (argv.graph) {
    console.log("The graph");
    let filename = argv._[0];
    // If the file is an AQUA file, we read it directly, otherwise, we read the AQUA
    // file corresponding with the file
    filename = filename.endsWith(".aqua.json") ? filename : filename + ".aqua.json";
    const credentials = readCredentials(credentialsFile);
    await verifyAndGetGraphData(filename, verbose, credentials);
    console.log();
  } else {
    let filename = argv._[0];
    // If the file is an AQUA file, we read it directly, otherwise, we read the AQUA
    // file corresponding with the file
    filename = filename.endsWith(".aqua.json") ? filename : filename + ".aqua.json";
     const credentials = readCredentials(credentialsFile);
    await verifyAquaTreeData(filename, verbose, credentials);
    console.log();
  }
}

// Execute the main function
(async function() {
  await main();
})();


// #!/usr/bin/env node

// import minimist from "minimist";
// import * as formatter from "./formatter.js";
// import * as verifyCommand from "./verify.js";
// import * as notarizeCommand from "./notarize.js";


// // Define an interface for command modules
// interface CommandModule {
//     execute: (args: minimist.ParsedArgs) => Promise<void>;
// }

// // Define a type for the commands object
// type Commands = {
//     [key in 'verify' | 'notarize']: CommandModule;
// };

// // Create the commands object with proper typing
// const commands: Commands = {
//     'verify': {
//         async execute(args: minimist.ParsedArgs) {
//             await verifyCommand.run(args);
//         },
//     },
//     'notarize':  {
//         async execute(args: minimist.ParsedArgs) {
//             await notarizeCommand.run(args);
//         },
//     },
// };

// function globalUsage() {
//     console.log(`Usage: aqua <command> [options]
  
//   Available Commands:
//     verify     Verify an AQUA file
//     notarize   Notarize a file and generate AQUA data
  
//   Run 'aqua <command> --help' for more information about a specific command.`);
// }

// async function main() {
//     const argv = minimist(process.argv.slice(2));
//     const command = argv._[0] as keyof Commands | undefined;
//     const remainingArgs = process.argv.slice(3);

//     if (!command) {
//         formatter.log_red("ERROR: You must specify a command");
//         globalUsage();
//         process.exit(1);
//     }

//     // Now TypeScript knows that command must be 'verify' or 'notarize'
//     if (!commands[command]) {
//         formatter.log_red(`ERROR: Unknown command '${command}'`);
//         globalUsage();
//         process.exit(1);
//     }

//     // Remove the command from argv._ so subcommands can process their own args
//     argv._.shift();

//     try {
//         await commands[command].execute(argv);
//     } catch (error) {
//         formatter.log_red(`Error executing ${command}: ${error instanceof Error ? error.message : String(error)}`);
//         process.exit(1);
//     }
// }

// main().catch((error) => {
//     formatter.log_red(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
//     process.exit(1);
// });