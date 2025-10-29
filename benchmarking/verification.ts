/**
 * Signature verification utilities
 *
 * Verifies Ethereum and Solana signatures are valid.
 * Called AFTER timing to avoid bias.
 */

import { verifyMessage } from 'viem';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify an Ethereum signature
 */
export async function verifyEthereumSignature(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  try {
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    return {
      valid: isValid,
      error: isValid ? undefined : 'Signature verification failed',
    };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Verify a Solana signature
 */
export async function verifySolanaSignature(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  try {
    // Convert message to bytes
    const messageBytes = new TextEncoder().encode(message);

    // Convert base64 signature to bytes
    const signatureBytes = Buffer.from(signature, 'base64');

    // Get public key bytes
    const publicKey = new PublicKey(address);
    const publicKeyBytes = publicKey.toBytes();

    // Verify signature
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    return {
      valid: isValid,
      error: isValid ? undefined : 'Signature verification failed',
    };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message,
    };
  }
}
