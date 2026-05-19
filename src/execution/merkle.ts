import { sha256Hex } from "../utils.js";
import type { MerkleProof } from "./types.js";

export function buildMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return sha256Hex("");
  }

  return buildMerkleLevels(leaves).at(-1)?.[0] ?? sha256Hex("");
}

export function buildMerkleProof(
  executionId: string,
  leaves: Array<{ executionId: string; hash: string }>,
): MerkleProof {
  const index = leaves.findIndex((leaf) => leaf.executionId === executionId);
  if (index < 0) {
    throw new Error(`Execution not found in ledger: ${executionId}`);
  }

  const levels = buildMerkleLevels(leaves.map((leaf) => leaf.hash));
  const siblings: MerkleProof["siblings"] = [];
  let cursor = index;

  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    const level = levels[levelIndex] ?? [];
    const isRight = cursor % 2 === 1;
    const siblingIndex = isRight ? cursor - 1 : cursor + 1;
    const siblingHash = level[siblingIndex] ?? level[cursor];
    if (!siblingHash) {
      throw new Error("Malformed Merkle level");
    }

    siblings.push({
      position: isRight ? "left" : "right",
      hash: siblingHash,
    });
    cursor = Math.floor(cursor / 2);
  }

  return {
    executionId,
    leafHash: leaves[index]?.hash ?? "",
    root: levels.at(-1)?.[0] ?? "",
    index,
    siblings,
  };
}

export function verifyMerkleProof(proof: MerkleProof): boolean {
  let cursor = proof.leafHash;

  for (const sibling of proof.siblings) {
    cursor =
      sibling.position === "left"
        ? hashPair(sibling.hash, cursor)
        : hashPair(cursor, sibling.hash);
  }

  return cursor === proof.root;
}

function buildMerkleLevels(leaves: string[]): string[][] {
  const levels: string[][] = [leaves];
  let current = leaves;

  while (current.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1] ?? left;
      if (!left || !right) {
        throw new Error("Malformed Merkle tree");
      }
      next.push(hashPair(left, right));
    }
    levels.push(next);
    current = next;
  }

  return levels;
}

function hashPair(left: string, right: string): string {
  return sha256Hex(`${left}${right}`);
}

