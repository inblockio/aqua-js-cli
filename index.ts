// @ts-nocheck
import { Buffer } from "buffer"
// End of compatibility with browsers.

import sha3 from "js-sha3"
import hrtime from "browser-process-hrtime"
import { MerkleTree } from "merkletreejs"

// utilities for verifying signatures
import * as ethers from "ethers"

import * as formatter from "./formatter.js"
import * as witnessNostr from "./witness_nostr.js"
import * as witnessEth from "./witness_eth.js"
import * as witnessTsa from "./witness_tsa.js"
import * as did from "./did.js"

// Currently supported API version.
const apiVersion = "0.3.0"

let VERBOSE = undefined

// Verification status
const INVALID_VERIFICATION_STATUS = "INVALID"
const VERIFIED_VERIFICATION_STATUS = "VERIFIED"
const ERROR_VERIFICATION_STATUS = "ERROR"

function getElapsedTime(start) {
  const precision = 2 // 2 decimal places
  const elapsed = hrtime(start)
  // elapsed[1] is in nanosecond, so we divide by a billion to get nanosecond
  // to second.
  return (elapsed[0] + elapsed[1] / 1e9).toFixed(precision)
}

const dict2Leaves = (obj) => {
  return Object.keys(obj)
    .sort()  // MUST be sorted for deterministic Merkle tree
    .map((key) => getHashSum(`${key}:${obj[key]}`))
}

function getHashSum(content: string) {
  return content === "" ? "" : sha3.sha3_512(content)
}

/**
 * Verifies the integrity of the merkle branch.
 * Steps:
 * - Traverses the nodes in the passed merkle branch.
 * - Returns false if the verification hash is not found in the first leaves pair.
 * - Returns false if the merkle branch hashes are inconsistent.
 * @param   {array} merkleBranch Array of merkle nodes.
 * @param   {string} verificationHash
 * @returns {boolean} Whether the merkle integrity is OK.
 */
function verifyMerkleIntegrity(merkleBranch, verificationHash: string) {
  if (merkleBranch.length === 0) {
    return false
  }

  let prevSuccessor = null
  for (const idx in merkleBranch) {
    const node = merkleBranch[idx]
    const leaves = [node.left_leaf, node.right_leaf]
    if (prevSuccessor) {
      if (!leaves.includes(prevSuccessor)) {
        return false
      }
    } else {
      // This means we are at the beginning of the loop.
      if (!leaves.includes(verificationHash)) {
        // In the beginning, either the left or right leaf must match the
        // verification hash.
        return false
      }
    }

    let calculatedSuccessor: string
    if (!node.left_leaf) {
      calculatedSuccessor = node.right_leaf
    } else if (!node.right_leaf) {
      calculatedSuccessor = node.left_leaf
    } else {
      calculatedSuccessor = getHashSum(node.left_leaf + node.right_leaf)
    }
    if (calculatedSuccessor !== node.successor) {
      //console.log("Expected successor", calculatedSuccessor)
      //console.log("Actual successor", node.successor)
      return false
    }
    prevSuccessor = node.successor
  }
  return true
}

/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Analyses the witnessing steps for a revision of a page and builds a
 * verification log.
 * Steps:
 * - Calls get_witness_data API passing witness event ID.
 * - Writes witness event ID and transaction hash to the log.
 * - Calls function checkEtherScan (see the file checkEtherScan.js) passing
 *   witness network, witness event transaction hash and the actual  witness
 *   event verification hash.
 * - If checkEtherScan returns true, writes to the log that witness is
 *   verified.
 * - Else logs error from the checkEtherScan call.
 * - If doVerifyMerkleProof is set, calls function verifyMerkleIntegrity.
 * - Writes the teturned boolean value from verifyMerkleIntegrity to the
 *   log.
 * - Returns the structured data summary of the witness verification.
 * @param   {int} witness_event_id
 * @param   {string} verificationHash
 * @param   {boolean} doVerifyMerkleProof Flag for do Verify Merkle Proof.
 * @returns {Promise<string>} The verification log.
 */
async function verifyWitness(
  witnessData,
  verification_hash: string,
  doVerifyMerkleProof: boolean,
) {
  const result = {
    tx_hash: witnessData.witness_transaction_hash,
    witness_network: witnessData.witness_network,
    result: "",
    error_message: "",
    merkle_root: witnessData.witness_merkle_root,
    witness_timestamp: witnessData.witness_timestamp,
    doVerifyMerkleProof: doVerifyMerkleProof,
    merkle_proof_status: "",
  }

  let isValid: boolean
  if (witnessData.witness_network === "nostr") {
    isValid = await witnessNostr.verify(
      witnessData.witness_transaction_hash,
      witnessData.witness_merkle_root,
      witnessData.witness_timestamp,
    )
  } else if (witnessData.witness_network === "TSA_RFC3161") {
    isValid = await witnessTsa.verify(
      witnessData.witness_transaction_hash,
      witnessData.witness_merkle_root,
      witnessData.witness_timestamp,
    )
  } else {
    // Verify the transaction hash via the Ethereum blockchain
    const _result = await witnessEth.verify(
      witnessData.witness_network,
      witnessData.witness_transaction_hash,
      witnessData.witness_merkle_root,
      witnessData.witness_timestamp,
    )
    result.result = _result

    if (_result !== "true" && _result !== "false") {
      result.error_message = _result
    }
    isValid = _result === "true"
  }
  result.isValid = isValid

  // At this point, we know that the witness matches.
  if (doVerifyMerkleProof) {
    // Only verify the witness merkle proof when verifyWitness is successful,
    // because this step is expensive.
    const merkleProofIsOK = verifyMerkleIntegrity(
      JSON.parse(witnessData.witness_merkle_proof),
      verification_hash,
    )
    result.merkle_proof_status = merkleProofIsOK ? "VALID" : "INVALID"
    if (!merkleProofIsOK) {
      return ["INVALID", result]
    }
  }
  return [isValid ? "VALID" : "INVALID", result]
}

const verifySignature = async (data: object, verificationHash: string) => {
  // TODO enforce that the verificationHash is a correct SHA3 sum string
  // Specify signature correctness
  let signatureOk = false
  if (verificationHash === "") {
    // The verificationHash MUST NOT be empty. This also implies that a genesis revision cannot
    // contain a signature.
    return [signatureOk, "INVALID"]
  }

  // Signature verification
  switch (data.signature_type) {
    case "did:key":
      signatureOk = await did.signature.verify(data.signature, data.signature_public_key, verificationHash)
      break
    case "Ethereum":
      // The padded message is required
      const paddedMessage = `I sign the following page verification_hash: [0x${verificationHash}]`
      try {
        const recoveredAddress = ethers.recoverAddress(
          ethers.hashMessage(paddedMessage),
          data.signature,
        )
        signatureOk =
          recoveredAddress.toLowerCase() ===
          data.signature_wallet_address.toLowerCase()
      } catch (e) {
        // continue regardless of error
      }
      break
  }

  const status = signatureOk ? "VALID" : "INVALID"
  return [signatureOk, status]
}

/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Verifies a revision from a page.
 * Steps:
 * - Calls verify_page API passing revision id.
 * - Calls function verifyWitness using data from the verify_page API call.
 * - Calculates the verification hash using content hash,
 *   signature hash and witness hash.
 * - If the calculated verification hash is different from the verification
 *   hash returned from the first verify_page API calls then logs a hash
 *   mismatch error, else sets verification status to VERIFIED.
 * - Does lookup on the Ethereum blockchain to find the witness_verification hash for digital timestamping
 *   stored in a smart contract to verify.
 * - If the recovered Address equals the current wallet address, sets valid
 *   signature to true.
 * - If witness status is inconsistent, sets witnessOk flag to false.
 * @param   {string} apiURL The URL for the API call.
 * @param   {Object} token The OAuth2 token required to make the API call or PKC must allow any request (LocalSettings.php).
 * @param   {string} revid The page revision id.
 * @param   {string} prevRevId The previous page revision id.
 * @param   {string} previousVerificationHash The previous verification hash string.
 * @param   {string} contentHash The page content hash string.
 * @param   {boolean} doVerifyMerkleProof Flag for do Verify Merkle Proof.
 * @returns {Promise<Array>} An array containing verification data,
 *                  verification-is-correct flag, and an array of page revision
 *                  details.
 */
async function verifyRevision(
  verificationHash: string,
  input,
  doVerifyMerkleProof: boolean,
) {
  let ok: boolean = true
  let result = {
    verification_hash: verificationHash,
    status: {
      content: false,
      signature: "MISSING",
      witness: "MISSING",
      verification: INVALID_VERIFICATION_STATUS,
    },
    witness_result: {},
    file_hash: "",
    data: input,
  }

  // Ensure mandatory claims are present
  const mandatory = {
    content: "content",
    signature: "signature",
    witness: "witness_merkle_root",
  }[input.revision_type]
  const mandatoryClaims = ["previous_verification_hash", "domain_id", "local_timestamp", mandatory]

  for (const claim of mandatoryClaims) {
    if (!(claim in input)) {
      return [false, { error_message: `mandatory field ${claim} is not present`}]
    }
  }

  // Ensure only either signature or witness is in the revision
  const hasSignature = "signature" in input
  const hasWitness = "witness_merkle_root" in input
  if (hasSignature && hasWitness) {
    return [
      false,
      { error_message: "Signature and witness must not both be present" },
    ]
  }

  const leaves = input.leaves
  delete input.leaves
  const actualLeaves = []

  // Verify leaves
  for (const [i, claim] of Object.keys(input).sort().entries()) {
    const actual = getHashSum(`${claim}:${input[claim]}`)
    const claimOk = leaves[i] === actual
    result.status[claim] = claimOk
    ok = ok && claimOk
    actualLeaves.push(actual)
  }

  // Verify signature
  if (hasSignature) {
    const [sigOk, sigStatus] = await verifySignature(
      input,
      input.previous_verification_hash,
    )
    result.status.signature = sigStatus
    ok = ok && sigOk
  }

  // Verify witness
  if (hasWitness) {
    // Witness
    const [witnessStatus, witnessResult] = await verifyWitness(
      input,
      //as of version v1.2 Aqua protocol it takes always the previous verification hash
      //as a witness and a signature MUST create a new revision of the Aqua-Chain
      input.previous_verification_hash,
      doVerifyMerkleProof,
    )
    result.witness_result = witnessResult
    result.status.witness = witnessStatus

    // Specify witness correctness
    ok = ok && (witnessStatus === "VALID")
  }

  // Verify verification hash
  const tree = new MerkleTree(leaves, getHashSum)
  const vhOk = tree.getHexRoot() === verificationHash
  ok = ok && vhOk
  result.status.verification = vhOk ? VERIFIED_VERIFICATION_STATUS : INVALID_VERIFICATION_STATUS
  return [ok, result]
}

function calculateStatus(count: number, totalLength: number) {
  if (count == totalLength) {
    if (count === 0) {
      return "NORECORD"
    } else {
      return VERIFIED_VERIFICATION_STATUS
    }
  } else {
    return INVALID_VERIFICATION_STATUS
  }
}

/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Verifies all of the verified revisions of a page.
 * Steps:
 * - Loops through the revision IDs for the page.
 *   Calls function verifyRevision, if isCorrect flag is returned as true,
 *   yield true and the revision detail.
 * @param   {Array} verifiedRevIds Array of revision ids which have verification detail.
 * @param   {string} server The server URL for the API call.
 * @param   {boolean} verbose
 * @param   {boolean} doVerifyMerkleProof The flag for whether to do rigorous
 *                    verification of the merkle proof. TODO clarify this.
 * @param   {Object} token (Optional) The OAuth2 token required to make the API call.
 * @returns {Generator} Generator for isCorrect boolean and detail object of
 *                      each revisions.
 */
async function* generateVerifyPage(
  verificationHashes,
  input,
  verbose: boolean | undefined,
  doVerifyMerkleProof: boolean,
) {
  VERBOSE = verbose

  let elapsed
  let totalElapsed = 0.0
  for (const vh of verificationHashes) {
    const elapsedStart = hrtime()

    const [isCorrect, detail] = await verifyRevision(
      vh,
      input.revisions[vh],
      doVerifyMerkleProof,
    )
    elapsed = getElapsedTime(elapsedStart)
    detail.elapsed = elapsed
    totalElapsed += elapsed
    if (!isCorrect) {
      yield [false, detail]
      return
    }
    yield [true, detail]
  }
}

async function verifyPage(input, verbose, doVerifyMerkleProof) {
  let verificationHashes
  verificationHashes = Object.keys(input.revisions)
  console.log("Page Verification Hashes: ", verificationHashes)
  let verificationStatus

  // Secure feature to detect detached chain, missing genesis revision
  const firstRevision =
    input.revisions[verificationHashes[verificationHashes.length - 1]]
  if (!firstRevision.previous_verification_hash === "") {
    verificationStatus = INVALID_VERIFICATION_STATUS
    console.log(`Status: ${verificationStatus}`)
    return [verificationStatus, null]
  }

  let count = 0
  if (verificationHashes.length > 0) {
    // Print out the verification hash of the first one.
    console.log(`${count + 1}. Verification of ${verificationHashes[0]}.`)
  }
  const details = {
    verification_hashes: verificationHashes,
    revision_details: [],
  }
  for await (const value of generateVerifyPage(
    verificationHashes,
    input,
    verbose,
    doVerifyMerkleProof,
  )) {
    const [isCorrect, detail] = value
    formatter.printRevisionInfo(detail, verbose)
    details.revision_details.unshift(detail)
    if (!isCorrect) {
      verificationStatus = INVALID_VERIFICATION_STATUS
      break
    }
    count += 1
    console.log(
      `  Progress: ${count} / ${verificationHashes.length} (${(
        (100 * count) /
        verificationHashes.length
      ).toFixed(1)}%)`,
    )
    if (count < verificationHashes.length) {
      console.log(
        `${count + 1}. Verification of Revision ${verificationHashes[count]}.`,
      )
    }
  }
  verificationStatus = calculateStatus(count, verificationHashes.length)
  console.log(`Status: ${verificationStatus}`)
  return [verificationStatus, details]
}

async function readFromMediaWikiAPI(server, title) {
  let response, data
  response = await fetch(
    `${server}/rest.php/data_accounting/get_page_last_rev?page_title=${title}`,
  )
  data = await response.json()
  if (!response.ok) {
    formatter.log_red(`Error: get_page_last_rev: ${data.message}`)
  }
  const verificationHash = data.verification_hash
  response = await fetch(
    `${server}/rest.php/data_accounting/get_branch/${verificationHash}`,
  )
  data = await response.json()
  const hashes = data.hashes
  const revisions = {}
  for (const vh of hashes) {
    response = await fetch(
      `${server}/rest.php/data_accounting/get_revision/${vh}`,
    )
    revisions[vh] = await response.json()
  }
  return { revisions }
}

async function getServerInfo(server) {
  const url = `${server}/rest.php/data_accounting/get_server_info`
  return fetch(url)
}

async function checkAPIVersionCompatibility(server) {
  const response = await getServerInfo(server)
  if (!response.ok) {
    return [formatHTTPError(response), false, ""]
  }
  const data = await response.json()
  if (data && data.api_version) {
    return ["FOUND", data.api_version === apiVersion, data.api_version]
  }
  return ["API endpoint found, but API version can't be retrieved", false, ""]
}

async function verifyPageFromMwAPI(server, title, verbose, ignoreMerkleProof) {
  let verifiedContent
  try {
    verifiedContent = await readFromMediaWikiAPI(server, title)
  } catch (e) {
    // TODO: be more specific than just returning empty revisions
    // NORECORD
    verifiedContent = { revisions: {} }
  }
  return await verifyPage(verifiedContent, verbose, !ignoreMerkleProof)
}

export {
  generateVerifyPage,
  verifyPage,
  apiVersion,
  // For verified_import.js
  ERROR_VERIFICATION_STATUS,
  // For notarize.js
  dict2Leaves,
  getHashSum,
  // For the VerifyPage Chrome extension and CLI
  verifyPageFromMwAPI,
  formatter,
  checkAPIVersionCompatibility,
}
