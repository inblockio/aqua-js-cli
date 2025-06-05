#!/usr/bin/env node

import * as main from "./index.js"
import minimist from "minimist"
import * as formatter from "./formatter.js"
import { readCredentials } from "./utils.js"

const opts = {
  // This is required so that -v and -m are position independent.
  boolean: ["v", "m", "graph"],
}
const argv = minimist(process.argv.slice(2), opts)

function usage() {
  console.log(`Usage:
  ./dist/aqua.js verify [OPTIONS] <filename>

  Options:
    -v                     Verbose
    --graph                Show the graph data
`)
}

// This should be a commandline argument for specifying the title of the page
// which should be verified.
if (argv._.length < 1) {
  formatter.log_red("ERROR: You must specify the file name or page title (if --api)")
  usage()
  process.exit(1)
}

const verbose = argv.v

// const server = argv.server ? argv.server : "http://localhost:9352"


export async function run(argvData: minimist.ParsedArgs = argv) {
   const credentialsFile = argv["cred"] || "~/.aqua/credentials.json";
        const credentials = readCredentials(credentialsFile, true, verbose);
  if (argvData.graph) {
    console.log("The graph")
    let filename = argvData._[0]
    // If the file is an AQUA file, we read it directly, otherwise, we read the AQUA
    // file corresponding with the file
    filename = filename.endsWith(".aqua.json") ? filename : filename + ".aqua.json"

     


    await main.verifyAndGetGraphData(filename, verbose, credentials);
    // await main.verifyPage(offlineData, verbose)
    console.log()
  }
  else {
    let filename = argvData._[0]
    // If the file is an AQUA file, we read it directly, otherwise, we read the AQUA
    // file corresponding with the file
    filename = filename.endsWith(".aqua.json") ? filename : filename + ".aqua.json"

    await main.verifyAquaTreeData(filename, verbose, credentials);
    // await main.verifyPage(offlineData, verbose)
    console.log()
  }
}


// The main function
// ; (async function () {
//   await run()
// })()