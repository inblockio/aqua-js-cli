#!/usr/bin/env node

const http = require( 'http' )
const sha3 = require('js-sha3')

// utilities for verifying signatures
const ethers = require('ethers')

const DEBUG = false

//This should be a commandline argument for specifying the title of the page which should be verified 
if (process.argv.length < 3) {
  console.log("You must specify the page title")
  exit(1)
}
let title = process.argv[2]

const apiURL = 'http://localhost:9352/rest.php/data_accounting/v1/standard'

function formatMwTimestamp(ts) {
  // Format timestamp into the timestamp format found in Mediawiki outputs
  return ts.replace(/-/g, '').replace(/:/g, '').replace('T', '').replace('Z', '')
}

function getHashSum(content) {
  if (content === '') {
    return ''
  }
  return sha3.sha3_512(content)
}

function calculateMetadataHash(domainId, timestamp, previousVerificationHash = "") {
    return getHashSum(domainId + timestamp + previousVerificationHash)
}

function calculateSignatureHash(signature, publicKey) {
    return getHashSum(signature + publicKey)
}

function calculateWitnessHash(page_manifest_verification_hash, merkle_root, witness_network, witness_tx_hash) {
    return getHashSum(page_manifest_verification_hash + merkle_root + witness_network + witness_tx_hash)
}

function calculateVerificationHash(contentHash, metadataHash, signature_hash, witness_hash) {
    return getHashSum(contentHash + metadataHash + signature_hash + witness_hash)
}

async function getBackendVerificationHash(revid) {
  http.get(`${apiURL}/request_hash?var1=${revid}`, (resp) => {
    resp.on('data', (data) => {
      obj = JSON.parse(data.toString()).value
    })
  })
}

async function verifyRevision(revid, prevRevId, previousVerificationHash, contentHash) {
  const data = await synchronousGet(`${apiURL}/verify_page?var1=${revid}`)
  if (data === '[]') {
    console.log('  no verification hash')
    return [null, false]
  }
  let obj = JSON.parse(data)

  // TODO do sanity check on domain id
  const domainId = obj.domain_id

  const metadataHash = calculateMetadataHash(domainId, obj.time_stamp, previousVerificationHash)

  let prevSignature = ''
  let prevPublicKey = ''
  if (prevRevId !== '') {
    const dataPrevious = await synchronousGet(`${apiURL}/verify_page?var1=${prevRevId}`)
    const objPrevious = JSON.parse(dataPrevious)
    // TODO just use signature and public key from previous element in the loop inside verifyPage
    // We have to do these ternary operations because sometimes the signature
    // and public key are nulls, not empty strings.
    const prevSignature = !!objPrevious.signature ? objPrevious.signature: ''
    const prevPublicKey = !!objPrevious.public_key ? objPrevious.public_key: ''
  }

  const signatureHash = calculateSignatureHash(prevSignature, prevPublicKey)

  const calculatedVerificationHash = calculateVerificationHash(contentHash, metadataHash, signatureHash, '')

  if (calculatedVerificationHash !== obj.verification_hash) {
    console.log("  verification hash doesn't match")
    if (DEBUG) {
      console.log(`  Actual content hash: ${contentHash}`)
      console.log(`  Actual metadata hash: ${metadataHash}`)
      console.log(`  Actual signature hash: ${signatureHash}`)
      console.log(`  Expected verification hash: ${obj.verification_hash}`)
      console.log(`  Actual verification hash: ${calculatedVerificationHash}`)
    }
    return [null, false]
  } else {
    console.log('  Verification hash matches')
  }
  if (obj.signature === '') {
    console.log('  * has not been signed')
  }

  if (obj.signature === '' || obj.signature === null) {
    return [obj.verification_hash, true]
  }

  if (DEBUG) {
    console.log('DEBUG backend', revid, obj)
  }
  // The padded message is required
  const paddedMessage = 'I sign the following page verification_hash: [0x' + obj.verification_hash + ']'
  const recoveredAddress = ethers.utils.recoverAddress(ethers.utils.hashMessage(paddedMessage), obj.signature)
  if (recoveredAddress.toLowerCase() === obj.wallet_address.toLowerCase()) {
    console.log('  signature is valid')
  }
  return [obj.verification_hash, true]
}

async function synchronousGet(url) {
  try {
    http_promise = new Promise((resolve, reject) => {
      http.get(url, (response) => {
        let chunks_of_data = [];

        response.on('data', (fragments) => {
          chunks_of_data.push(fragments);
        });

        response.on('end', () => {
          let response_body = Buffer.concat(chunks_of_data);

          // promise resolved on success
          resolve(response_body.toString())
        });

        response.on('error', (error) => {
          // promise rejected on error
          reject(error)
        });
      });
    });
    return await http_promise;
  }
	catch(e) {
		// if the Promise is rejected
		console.error(e)
	}
}

function verifyPage(title) {
  http.get(`${apiURL}/page_all_rev?var1=${title}`, (resp) => {
    let body = ""
    resp.on('data', (chunk) => {
      body += chunk
    })
    resp.on('end', async () => {
      allRevInfo = JSON.parse(body)
      verifiedRevIds = allRevInfo.map(x => x.rev_id)
      console.log('verified ids', verifiedRevIds)

      let previousVerificationHash = ''
      let previousRevId = ''
      let count = 0
      for (const idx in verifiedRevIds) {
        const revid = verifiedRevIds[idx]
        console.log(revid)

        // CONTENT DATA HASH CALCULATOR
        const bodyRevid = await synchronousGet(`http://localhost:9352/api.php?action=parse&oldid=${revid}&prop=wikitext&formatversion=2&format=json`)
        const content = JSON.parse(bodyRevid).parse.wikitext
        const contentHash = getHashSum(content)

        const [verificationHash, isCorrect] = await verifyRevision(revid, previousRevId, previousVerificationHash, contentHash)
        if (isCorrect) {
          count += 1
        }
        console.log(`  ${(100 * count / verifiedRevIds.length).toFixed(1)}% page validation`)
        previousVerificationHash = verificationHash
        previousRevId = revid
      }
    })
  }).on("error", (err) => {
    console.log("Error: " + err.message);
  })
}

console.log(`Verifying ${title}`)
verifyPage(title)
