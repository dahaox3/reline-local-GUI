import { Card, CardHeader, CardContent } from "~/components/ui"
import React, { useContext } from "react"
import { NodesContext, NodesDispatchContext } from "~/context/contexts"
import { NodeResolver } from "~/components/node-resolver"
import { AddNodeButton } from "~/components/add-node-button"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import {restrictToFirstScrollableAncestor, restrictToVerticalAxis} from "@dnd-kit/modifiers"
import { NodesActionType } from "~/types/actions"
import { NodeType } from "~/types/enums"
import { AlertTriangle } from "lucide-react"

export function NodesSection() {
    const nodes = useContext(NodesContext)
    const dispatch = useContext(NodesDispatchContext)
    const writerIndex = nodes.findIndex((node) => node.type === NodeType.FOLDER_WRITER)
    const writerHasLaterNodes = writerIndex !== -1 && writerIndex < nodes.length - 1

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                delay: 100,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const handleDragStart = () => {
        nodes.forEach((node) => {
            if (!node.collapsed) {
                dispatch({
                    type: NodesActionType.CHANGE,
                    payload: {
                        ...node,
                        collapsed: true,
                    },
                })
            }
        })
    }

    const handleDragEnd = (event: any) => {
        const { active, over } = event

        if (active.id !== over.id) {
            const oldIndex = nodes.findIndex((node) => node.id === active.id)
            const newIndex = nodes.findIndex((node) => node.id === over.id)

            dispatch({
                type: NodesActionType.MOVE,
                payload: {
                    from: oldIndex,
                    to: newIndex,
                },
            })
        }
    }

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center">
                <h2 className="scroll-m-20 text-xl font-semibold tracking-tight">Nodes</h2>
                <AddNodeButton />
            </CardHeader>
            <CardContent className="flex flex-col gap-3 flex-1 overflow-hidden">
                {writerHasLaterNodes && (
                    <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Folder writer is before another node. Server mode delays writing until later nodes finish; normal pipeline mode may skip those later nodes.</span>
                    </div>
                )}
                <ScrollArea className="rounded-md m-0 border h-full overflow-x-hidden">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                    >
                        <SortableContext
                            items={nodes.map((node) => node.id)} // Используем node.id как уникальный ключ
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="grid grid-cols-1 gap-3 p-4 w-full max-w-full">
                                {nodes.map((data) => (
                                    <SortableNodeResolver key={data.id} id={data.id} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                    <ScrollBar orientation="vertical" />
                </ScrollArea>
            </CardContent>
        </Card>
    )
}

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {cn} from "~/lib/utils.ts";

function SortableNodeResolver({ id }: { id: number }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 0,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className={cn(isDragging && "cursor-grabbing")}
        >
            <NodeResolver id={id} dragListeners={listeners} isDragging={isDragging}/>
        </div>
    )
}
