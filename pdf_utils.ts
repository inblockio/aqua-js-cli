import pako from 'pako';
import { PDFDocument, PDFName, PDFString, PDFHexString, PDFDict, PDFArray } from 'pdf-lib';
import { AquaTree, FileObject } from 'aqua-js-sdk';

export interface EmbeddedAquaData {
  aquaJson: any | null;
  aquaChainFiles: Array<{ filename: string; content: string }>;
  assetFiles: Array<{ filename: string; content: string | Uint8Array }>;
}

export interface PdfSignatureInfo {
  hasSig: boolean;
  signerName?: string;
  reason?: string;
  signedAt?: string;
  platform?: string;
  walletAddress?: string;
  documentHash?: string;
}

/**
 * Extracts embedded aqua.json and related files from a signed PDF.
 * Port of web's extractEmbeddedAquaData from pdf-digital-signature.ts
 */
export async function extractEmbeddedAquaData(
  pdfBytes: Uint8Array
): Promise<EmbeddedAquaData> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    let aquaJson: any = null;
    const aquaChainFiles: Array<{ filename: string; content: string }> = [];
    const assetFiles: Array<{ filename: string; content: string | Uint8Array }> = [];

    // Access the catalog to find embedded files
    const catalog = pdfDoc.catalog;
    const namesDict = catalog.lookup(PDFName.of('Names'));

    if (!namesDict || !(namesDict instanceof PDFDict)) {
      return { aquaJson: null, aquaChainFiles: [], assetFiles: [] };
    }

    const embeddedFilesDict = namesDict.lookup(PDFName.of('EmbeddedFiles'));

    if (!embeddedFilesDict || !(embeddedFilesDict instanceof PDFDict)) {
      return { aquaJson: null, aquaChainFiles: [], assetFiles: [] };
    }

    const namesArray = embeddedFilesDict.lookup(PDFName.of('Names'));

    if (!namesArray || !(namesArray instanceof PDFArray)) {
      return { aquaJson: null, aquaChainFiles: [], assetFiles: [] };
    }

    // Names array contains alternating filename and filespec entries
    for (let i = 0; i < namesArray.size(); i += 2) {
      try {
        const filenameObj = namesArray.get(i);
        const filespecRef = namesArray.get(i + 1);

        if (!(filenameObj instanceof PDFString || filenameObj instanceof PDFHexString)) {
          continue;
        }

        const filename = filenameObj.decodeText();

        const filespec = pdfDoc.context.lookup(filespecRef);

        if (!filespec || !(filespec instanceof PDFDict)) {
          continue;
        }

        const efDict = filespec.lookup(PDFName.of('EF'));

        if (!efDict || !(efDict instanceof PDFDict)) {
          continue;
        }

        const fileStreamRef = efDict.lookup(PDFName.of('F'));
        const fileStream = pdfDoc.context.lookup(fileStreamRef);

        if (!fileStream) {
          continue;
        }

        // Decode the embedded file content
        let fileBytes: Uint8Array;

        if ((fileStream as any).contents) {
          fileBytes = (fileStream as any).contents;
        } else {
          continue;
        }

        if (!fileBytes || fileBytes.length === 0) {
          continue;
        }

        // Zlib header starts with 0x78
        const isZlibCompressed = fileBytes[0] === 0x78;
        const isTextFile = filename.endsWith('.json');

        let rawBytes: Uint8Array;

        if (isZlibCompressed) {
          try {
            rawBytes = pako.inflate(fileBytes);
          } catch (error) {
            rawBytes = fileBytes;
          }
        } else {
          rawBytes = fileBytes;
        }

        if (filename === 'aqua.json') {
          try {
            const textContent = Buffer.from(rawBytes).toString('utf-8');
            aquaJson = JSON.parse(textContent);
          } catch (error) {
            console.error('Failed to parse aqua.json:', error);
          }
        } else if (filename.endsWith('.aqua.json')) {
          const textContent = Buffer.from(rawBytes).toString('utf-8');
          aquaChainFiles.push({ filename, content: textContent });
        } else if (isTextFile) {
          const textContent = Buffer.from(rawBytes).toString('utf-8');
          assetFiles.push({ filename, content: textContent });
        } else {
          // Binary asset file — keep as Uint8Array
          assetFiles.push({ filename, content: rawBytes });
        }
      } catch (error) {
        console.error('Failed to process embedded file at index', i, ':', error);
      }
    }

    return { aquaJson, aquaChainFiles, assetFiles };
  } catch (error) {
    console.error('Error extracting embedded aqua data:', error);
    return { aquaJson: null, aquaChainFiles: [], assetFiles: [] };
  }
}

/**
 * Extracts signature information from a signed PDF's Info dictionary.
 * Port of web's extractSignatureInfo from pdf-digital-signature.ts
 */
export async function extractSignatureInfo(
  pdfBytes: Uint8Array
): Promise<PdfSignatureInfo> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const infoDict = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Info);

    if (!(infoDict instanceof PDFDict)) {
      return { hasSig: false };
    }

    const getStringValue = (key: string): string | undefined => {
      const value = infoDict.lookup(PDFName.of(key));
      if (value instanceof PDFString || value instanceof PDFHexString) {
        return value.decodeText();
      }
      return undefined;
    };

    const signerName = getStringValue('SignedBy');
    const reason = getStringValue('SignatureReason');
    const signedAt = getStringValue('SignatureDate');
    const platform = getStringValue('SignaturePlatform');
    const walletAddress = getStringValue('SignerWallet');
    const documentHash = getStringValue('DocumentHash');

    return {
      hasSig: !!signerName || !!platform,
      signerName,
      reason,
      signedAt,
      platform,
      walletAddress,
      documentHash,
    };
  } catch (error) {
    console.error('Error extracting signature info:', error);
    return { hasSig: false };
  }
}

/**
 * Builds an AquaTree and FileObject[] from embedded PDF data.
 * Port of VerifyDocument.tsx logic (lines 397-476).
 */
export function buildAquaTreeFromPdf(
  embeddedData: EmbeddedAquaData
): { aquaTree: AquaTree; fileObjects: FileObject[] } {
  const aquaJson = embeddedData.aquaJson;

  if (!aquaJson || !aquaJson.genesis || !aquaJson.name_with_hash || !Array.isArray(aquaJson.name_with_hash)) {
    throw new Error('Invalid aqua.json structure: missing genesis or name_with_hash');
  }

  // Get the main aqua tree file
  const mainAquaTreeFileName = `${aquaJson.genesis}.aqua.json`;
  const mainAquaTreeFile = embeddedData.aquaChainFiles.find(f => f.filename === mainAquaTreeFileName);

  if (!mainAquaTreeFile) {
    throw new Error(`Main aqua tree file not found: ${mainAquaTreeFileName}`);
  }

  // Parse the main aqua tree
  const aquaTreeData: AquaTree = JSON.parse(mainAquaTreeFile.content);

  if (!aquaTreeData.revisions || !aquaTreeData.file_index) {
    throw new Error('Invalid aqua tree structure: missing revisions or file_index');
  }

  // Build fileObjects from name_with_hash entries
  const fileObjects: FileObject[] = [];

  for (const nameHash of aquaJson.name_with_hash) {
    if (nameHash.name.endsWith('.aqua.json')) {
      const aquaFile = embeddedData.aquaChainFiles.find(f => f.filename === nameHash.name);
      if (!aquaFile) {
        continue;
      }

      let parsedContent: any = aquaFile.content;
      try {
        parsedContent = JSON.parse(aquaFile.content);
      } catch {
        // Keep as string if not valid JSON
      }

      fileObjects.push({
        fileName: nameHash.name,
        fileContent: parsedContent,
        path: ''
      });
    } else {
      // Asset file
      const assetFile = embeddedData.assetFiles.find(f => f.filename === nameHash.name);
      if (assetFile) {
        const content = assetFile.content instanceof Uint8Array
          ? assetFile.content
          : assetFile.content;
        fileObjects.push({
          fileName: nameHash.name,
          fileContent: content,
          path: ''
        });
      }
    }
  }

  return { aquaTree: aquaTreeData, fileObjects };
}
