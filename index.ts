// @ts-nocheck
import { Buffer } from "buffer"
// End of compatibility with browsers.

import * as fs from "fs"
import hrtime from "browser-process-hrtime"
import { MerkleTree } from "merkletreejs"

// utilities for verifying signatures
import * as ethers from "ethers"

import * as formatter from "./formatter.js"
import * as witnessNostr from "./witness_nostr.js"
import * as witnessEth from "./witness_eth.js"
import * as witnessTsa from "./witness_tsa.js"
import * as did from "./did.js"
import crypto from "crypto"
import Aquafier, { printLogs, AquaTree, FileObject, LogType, printGraphData } from "aqua-js-sdk"
import { readExportFile } from "./utils.js"
import * as path from 'path';

export async function verifyAquaTreeData(fileName: string, verboseOption: boolean = false) {
  console.log(`file name ${fileName}`);
  const aquafier = new Aquafier();
  const filenameToRead = fileName.endsWith(".aqua.json") ? fileName : fileName + ".aqua.json";
  // console.log(`-> reading file  ${fileName}`);
  const aquaTree = await readExportFile(fileName);

  let fileObjectsArray = [];

  // Extract the directory from the file path to use as base path
  const basePath = path.dirname(fileName);

  let filesToBeRead = aquafier.fetchFilesToBeRead(aquaTree);
  // console.log(`filesToBeRead ${JSON.stringify(filesToBeRead)}`);
  let fileObjectsArraySecondary = await readAllNecessaryFiles(filesToBeRead, aquafier, fileObjectsArray, basePath);

  // let fileObjectItem = fileObjectsArraySecondary.find((e) => e.fileName == 'sample_2.txt')
  //   if (fileObjectItem == undefined) {
  // console.log('dammn')
  // return 
  // }
  let result = await aquafier.verifyAquaTree(aquaTree, fileObjectsArraySecondary);

  if (result!.isOk()) {
    result.data.logData.push({
      log: "All revisions verified successfully",
      logType: LogType.SUCCESS
    });
    printLogs(result.data.logData, verboseOption);
  } else {
    result.data.push({
      log: "One or more revision verification failed",
      logType: LogType.FINAL_ERROR
    });
    printLogs(result.data, verboseOption);
  }
}


async function readAllNecessaryFiles(
  filesToBeRead: string[],
  aquafier: Aquafier,
  fileObjectsArray: FileObject[],
  basePath: string = ""
): Promise<FileObject[]> {
  // if aqua tree contains link all the linked aqua files must be read into the fileObjects Array

  for (let item of filesToBeRead) {
    const fullPath = basePath ? path.join(basePath, item) : item;

    // Get just the filename without path for comparison and storage
    const itemBaseName = path.basename(item);

    if (fileObjectsArray.find((e) => e.fileName === itemBaseName)) {
      // console.log(` File ${itemBaseName} has been read`)
    } else {
      const aquaFile = item.endsWith(".aqua.json") ? fullPath : fullPath + ".aqua.json";

      // raw file
      const pureFileNameItem = itemBaseName.replace(".aqua.json", "");
      const pureFilePath = basePath ? path.join(basePath, pureFileNameItem) : pureFileNameItem;

      console.log(`-> reading pure file ${pureFilePath}`);
      let fileContentsItem = await readExportFile(pureFilePath, false);
      fileObjectsArray.push({
        fileName: pureFileNameItem,
        fileContent: fileContentsItem,
        path: basePath
      });

      if (fs.existsSync(aquaFile)) {
        // aqua file
        console.log(`-> reading aqua file ${aquaFile}`);
        let fileContentsAquaFile = await readExportFile(aquaFile, false);

        // Use just the basename for the aqua file, not the full path
        const aquaFileBaseName = path.basename(aquaFile);

        fileObjectsArray.push({
          fileName: aquaFileBaseName,
          fileContent: fileContentsAquaFile,
          path: basePath
        });

        // Get directory of the current aqua file to use as base path for linked files
        const aquaFileDir = path.dirname(aquaFile);

        let _filesToBeRead = aquafier.fetchFilesToBeRead(fileContentsAquaFile);
        // Since we're returning an array not appending, we should assign the result
        let linkedFiles = await readAllNecessaryFiles(_filesToBeRead, aquafier, fileObjectsArray, aquaFileDir);

        // Don't push the result, as the recursive call already updates fileObjectsArray
        // fileObjectsArray.push(...res); - This line is removed
      }
    }
  }

  return fileObjectsArray;
}


export async function verifyAndGetGraphData(fileName: string, verboseOption: boolean = false) {
  const aquafier = new Aquafier();
  const filenameToRead = fileName.endsWith(".aqua.json") ? fileName : fileName + ".aqua.json"
  // console.log(`-> reading file  ${fileName}`)
  const aquaTree = await readExportFile(fileName)

  let fileObjectsArray = []

  // the file that has been aquafied

  let pureFileName = fileName.replace(".aqua.json", "")
  let fileContents = await readExportFile(pureFileName, false);
  fileObjectsArray.push({
    fileName: pureFileName,
    fileContent: fileContents,
    path: ""
  });

  let filesToBeRead = aquafier.fetchFilesToBeRead(aquaTree)


  let fileObjectsArraySecondary = await readAllNecessaryFiles(filesToBeRead, aquafier, fileObjectsArray)
  // fileObjectsArray.push(...fileObjectsArraySecondary)

  let result = await aquafier.verifyAndGetGraphData(aquaTree, fileObjectsArray);

  // console.log("Graph Data \nsign" + JSON.stringify(result, null, 4) + "\n")
  if (result!.isOk()) {
    printGraphData(result.data, "", verboseOption)
  } else {
    result.data.push({
      log: "AquaTree verification failed",
      logType: LogType.FINAL_ERROR
    })
    printLogs(result.data, verboseOption)
  }

}

