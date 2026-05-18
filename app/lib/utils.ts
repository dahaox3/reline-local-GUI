import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { StackNode } from "~/types/node.ts"
import { convertToPure, convertToStack } from "~/lib/convert"
import {toast} from "sonner";
import {NodeType, PureNodeType} from "~/types/enums.ts";
import { DEFAULT_NODE_OPTIONS } from "~/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const nodesToString: (nodes: StackNode[]) => string = (nodes) => {
  return JSON.stringify(convertToPure(nodes), null, 2)
}

export const stringToNodes: (text: string) => StackNode[] = (text) => {
    let pureNodes;
    try {
        pureNodes = JSON.parse(text);
    } catch (error) {
        toast.error("Error parsing JSON:", error);
        return [];
    }

    pureNodes = pureNodes.filter((node: any) => {
        if (!Object.values(PureNodeType).includes(node.type)) {
            console.error(`Skipped unknown node type: ${node.type}`);
            return false;
        }
        return true;
    });

    return convertToStack(pureNodes);
}

export function remapNodeIds(nodes: StackNode[]): StackNode[] {
    return normalizeStackNodes(nodes);
}

export function nextNodeId(nodes: StackNode[]): number {
    return nodes.reduce((max, node) => Math.max(max, Number.isFinite(node.id) ? node.id : -1), -1) + 1;
}

export function normalizeStackNodes(nodes: unknown): StackNode[] {
    if (!Array.isArray(nodes)) return [];

    const validTypes = new Set(Object.values(NodeType));
    const normalized: StackNode[] = [];

    for (const node of nodes) {
        if (!node || typeof node !== "object") continue;

        const draft = node as Partial<StackNode>;
        if (!draft.type || !validTypes.has(draft.type)) continue;

        normalized.push({
            id: normalized.length,
            type: draft.type,
            options: {
                ...cloneDefaultOptions(draft.type),
                ...(draft.options && typeof draft.options === "object" ? draft.options : {}),
            },
            collapsed: Boolean(draft.collapsed),
        } as StackNode);
    }

    return normalized;
}

const cloneDefaultOptions = (type: NodeType) => JSON.parse(JSON.stringify(DEFAULT_NODE_OPTIONS[type] ?? {}));
