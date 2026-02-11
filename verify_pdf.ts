import * as fs from 'fs';
import Aquafier, { printLogs, printGraphData, CredentialsData, LogType } from 'aqua-js-sdk';
import * as formatter from './formatter.js';
import { extractEmbeddedAquaData, extractSignatureInfo, buildAquaTreeFromPdf, PdfSignatureInfo } from './pdf_utils.js';

/**
 * Prints PDF signature metadata in a formatted table.
 */
function printSignatureInfo(sigInfo: PdfSignatureInfo): void {
  if (!sigInfo.hasSig) {
    console.log('No Aquafier signature metadata found in PDF.');
    return;
  }

  console.log('\n--- PDF Signature Info ---');
  if (sigInfo.signerName)    console.log(`  Signed By:      ${sigInfo.signerName}`);
  if (sigInfo.walletAddress) console.log(`  Wallet Address: ${sigInfo.walletAddress}`);
  if (sigInfo.reason)        console.log(`  Reason:         ${sigInfo.reason}`);
  if (sigInfo.signedAt)      console.log(`  Signed At:      ${sigInfo.signedAt}`);
  if (sigInfo.platform)      console.log(`  Platform:       ${sigInfo.platform}`);
  if (sigInfo.documentHash)  console.log(`  Document Hash:  ${sigInfo.documentHash}`);
  console.log('-------------------------\n');
}

/**
 * Verify a signed PDF by extracting embedded aqua chain data and running SDK verification.
 */
export async function verifyPdfAquaTreeData(
  pdfPath: string,
  verbose: boolean,
  credentials: CredentialsData
): Promise<void> {
  const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));

  // Extract and print signature metadata
  const sigInfo = await extractSignatureInfo(pdfBytes);
  printSignatureInfo(sigInfo);

  // Extract embedded aqua data
  const embeddedData = await extractEmbeddedAquaData(pdfBytes);

  if (!embeddedData.aquaJson) {
    formatter.log_red('ERROR: No embedded aqua chain data found in PDF.');
    process.exit(1);
  }

  // Build aqua tree and file objects from embedded data
  const { aquaTree, fileObjects } = buildAquaTreeFromPdf(embeddedData);

  // Verify
  const aquafier = new Aquafier();
  const result = await aquafier.verifyAquaTree(aquaTree, fileObjects, credentials);

  if (result!.isOk()) {
    result.data.logData.push({
      log: 'All revisions verified successfully',
      logType: LogType.SUCCESS,
    });
    printLogs(result.data.logData, verbose);
  } else {
    result.data.push({
      log: 'One or more revision verification failed',
      logType: LogType.FINAL_ERROR,
    });
    printLogs(result.data, verbose);
  }
}

/**
 * Verify a signed PDF and print graph data.
 */
export async function verifyPdfAndGetGraphData(
  pdfPath: string,
  verbose: boolean,
  credentials: CredentialsData
): Promise<void> {
  const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));

  // Extract and print signature metadata
  const sigInfo = await extractSignatureInfo(pdfBytes);
  printSignatureInfo(sigInfo);

  // Extract embedded aqua data
  const embeddedData = await extractEmbeddedAquaData(pdfBytes);

  if (!embeddedData.aquaJson) {
    formatter.log_red('ERROR: No embedded aqua chain data found in PDF.');
    process.exit(1);
  }

  // Build aqua tree and file objects from embedded data
  const { aquaTree, fileObjects } = buildAquaTreeFromPdf(embeddedData);

  // Verify and get graph data
  const aquafier = new Aquafier();
  const result = await aquafier.verifyAndGetGraphData(aquaTree, fileObjects, credentials);

  if (result!.isOk()) {
    printGraphData(result.data, '', verbose);
  } else {
    printLogs(result.data, verbose);
  }
}
