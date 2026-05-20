import {useContext, useEffect, useState} from "react"
import {NodesContext, NodesDispatchContext} from "~/context/contexts"
import {ModelsContext, useSetModels, useModels} from "~/context/model-provider"
import {ColorDetectMode, DType, ModelCacheMode, TilerType} from "~/types/enums"
import {Label} from "../ui/label"
import {DEFAULT_MODEL, DEFAULT_TILE_SIZE} from "~/constants"
import {Popover, PopoverContent, PopoverTrigger} from "../ui/popover"
import {Button} from "../ui/button"
import {Check, ChevronsUpDown, File, FolderOpen, X} from "lucide-react"
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "../ui/command"
import {cn} from "~/lib/utils"
import {Input} from "../ui/input"
import {Checkbox} from "../ui/checkbox"
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "../ui/select"
import type {UpscaleNodeOptions} from "~/types/options"
import {NodesActionType} from "~/types/actions"


function Combobox({value, onChange, placeholder = "Select model"}: { value: string; onChange: (value: string) => void; placeholder?: string }) {
    const [open, setOpen] = useState(false);
    const {models} = useModels();

    const displayValue = !value || value === "select folder" ? placeholder : value;
    const isPlaceholder = !value || value === "select folder";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full grid grid-cols-[1fr_auto] items-center",
                        isPlaceholder && "text-muted-foreground font-normal"
                    )}
                >
                    <span className="truncate pr-2 text-left">
                        {displayValue}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50"/>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
                <Command>
                    <CommandInput placeholder="Search..."/>
                    <CommandList>
                        <CommandEmpty>No models found.</CommandEmpty>
                        <CommandGroup>
                            {Array.isArray(models) && models.length > 0 ? (
                                models.map((model) => (
                                    <CommandItem
                                        key={model}
                                        value={model}
                                        onSelect={() => {
                                            onChange(model);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn("mr-2 h-4 w-4", value === model ? "opacity-100" : "opacity-0")}/>
                                        {model}
                                    </CommandItem>
                                ))
                            ) : null}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function UpscaleNodeBody({id}: { id: number }) {
    const nodes = useContext(NodesContext)
    const node = nodes.find((n) => n.id === id)
    if (!node) {
        return null
    }
    const options = node.options as UpscaleNodeOptions
    const dispatch = useContext(NodesDispatchContext)
    const {models} = useContext(ModelsContext)
    const setModels = useSetModels()

    useEffect(() => {
        if (!options.auto_detect_color && options.model === "select folder" && models.length > 0 && !options.is_own_model) {
            changeValue({model: models[0]});
        }
    }, [models, options.model, options.is_own_model, options.auto_detect_color, options.gray_model]);


    const handleChooseFolder = async () => {
        const result = await window.electronAPI.selectModelFolder();
        if (result && Array.isArray(result.models)) {
            setModels({folderPath: result.folderPath, models: result.models});
            const defaultModel = result.models[0] || "select folder";
            if (!options.auto_detect_color) {
                changeValue({model: defaultModel});
            }
        }
    };

    const handleChooseFile = async (changeValue: (val: Partial<UpscaleNodeOptions>) => void) => {
        const filePath = await window.electronAPI.selectModelFile()
        if (filePath) {
            changeValue({model: filePath})
        }
    }

    const changeValue = (newOptions: Partial<UpscaleNodeOptions>) => {
        dispatch({
            type: NodesActionType.CHANGE,
            payload: {
                ...node,
                options: {
                    ...node.options,
                    ...newOptions,
                },
            },
        })
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center space-x-2">
                <Checkbox
                    checked={!!options.auto_detect_color}
                    onCheckedChange={(value) => {
                        const enabled = !!value;
                        changeValue({
                            auto_detect_color: enabled,
                            gray_model: options.gray_model,
                            color_model: options.color_model || "",
                            color_detect_mode: options.color_detect_mode || ColorDetectMode.AUTO,
                            model_cache_mode: options.model_cache_mode || ModelCacheMode.LOW_MEMORY,
                        })
                    }}
                />
                <Label>auto detect color</Label>
            </div>

            <div className="flex flex-col gap-2">
                {options.auto_detect_color ? (
                    <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-2">
                            <Label>Color detect mode</Label>
                            <Select
                                onValueChange={(value: ColorDetectMode) => changeValue({color_detect_mode: value})}
                                value={options.color_detect_mode || ColorDetectMode.AUTO}
                            >
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        {Object.values(ColorDetectMode).map((mode) => {
                                            return (
                                                <SelectItem key={mode} value={mode}>
                                                    {mode}
                                                </SelectItem>
                                            )
                                        })}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>Model cache</Label>
                            <Select
                                onValueChange={(value: ModelCacheMode) => changeValue({model_cache_mode: value})}
                                value={options.model_cache_mode || ModelCacheMode.LOW_MEMORY}
                            >
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        {Object.values(ModelCacheMode).map((mode) => {
                                            return (
                                                <SelectItem key={mode} value={mode}>
                                                    {mode}
                                                </SelectItem>
                                            )
                                        })}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>Gray model</Label>
                            <div className="flex items-center gap-2">
                                <Combobox
                                    value={options.gray_model || ""}
                                    placeholder="Select gray model"
                                    onChange={(model) => {
                                        changeValue({gray_model: model});
                                    }}
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    type="button"
                                    title="Select folder"
                                    onClick={handleChooseFolder}
                                >
                                    <FolderOpen/>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    type="button"
                                    title="Clear gray model"
                                    onClick={() => changeValue({gray_model: ""})}
                                >
                                    <X/>
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Leave empty to let gray pages pass through this upscale node.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>Color model</Label>
                            <div className="flex items-center gap-2">
                                <Combobox
                                    value={options.color_model || ""}
                                    placeholder="Select color model"
                                    onChange={(model) => {
                                        changeValue({color_model: model});
                                    }}
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    type="button"
                                    title="Select folder"
                                    onClick={handleChooseFolder}
                                >
                                    <FolderOpen/>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    type="button"
                                    title="Clear color model"
                                    onClick={() => changeValue({color_model: ""})}
                                >
                                    <X/>
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Leave empty to let color pages pass through this upscale node.
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        <Label>Model</Label>
                        {options.is_own_model ? (
                            <div className="flex items-center gap-2">
                                <Input
                                    placeholder="Path/to/model"
                                    value={options.model}
                                    onChange={(e) => {
                                        changeValue({model: e.target.value})
                                    }}
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    type="button"
                                    title="Select file"
                                    onClick={() => handleChooseFile(changeValue)}
                                >
                                    <File/>
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Combobox
                                    value={options.model}
                                    placeholder="Select folder"
                                    onChange={(model) => {
                                        changeValue({model});
                                    }}
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    type="button"
                                    title="Select folder"
                                    onClick={handleChooseFolder}
                                >
                                    <FolderOpen/>
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="flex flex-col gap-2">
                <Label>Tiler</Label>
                <Select
                    onValueChange={(value) => {
                        if (value === TilerType.EXACT) {
                            changeValue({
                                exact_tiler_size: DEFAULT_TILE_SIZE,
                                tiler: value as TilerType,
                            })
                        } else {
                            changeValue({
                                exact_tiler_size: undefined,
                                tiler: value as TilerType,
                            })
                        }
                    }}
                    value={options.tiler}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {Object.values(TilerType).map((type) => {
                                return (
                                    <SelectItem key={type} value={type}>
                                        {type}
                                    </SelectItem>
                                )
                            })}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {options.tiler === TilerType.EXACT && (
                <div className="flex flex-col gap-2">
                    <Label>Tile size</Label>
                    <Input
                        type="number"
                        className="w-[180px]"
                        step={100}
                        value={options.exact_tiler_size}
                        onChange={(e) => {
                            changeValue({
                                exact_tiler_size: Number.parseInt(e.target.value),
                            })
                        }}
                    />
                </div>
            )}

            <div className="flex flex-col gap-2">
                <Label>Target scale</Label>
                <div className="flex items-center gap-2">
                    <Input
                        type="number"
                        className="w-[180px]"
                        min={1}
                        step={1}
                        value={options.target_scale ?? ""}
                        placeholder="Use model scale"
                        onChange={(e) => {
                            const raw = e.target.value.trim()
                            changeValue({
                                target_scale: raw ? Number.parseInt(raw) : undefined,
                            })
                        }}
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        type="button"
                        title="Clear target scale"
                        onClick={() => changeValue({target_scale: undefined})}
                    >
                        <X/>
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Leave empty to use the model's native upscale factor.
                </p>
            </div>

            <div className="flex flex-col gap-2">
                <Label>DType</Label>
                <Select onValueChange={(value: DType) => changeValue({dtype: value})} value={options.dtype}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {Object.values(DType).map((type) => {
                                return (
                                    <SelectItem key={type} value={type}>
                                        {type}
                                    </SelectItem>
                                )
                            })}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {!options.auto_detect_color && (
                <div className="flex items-center space-x-2">
                    <Checkbox
                        checked={options.is_own_model}
                        onCheckedChange={(value) => {
                            if (!value) {
                                const selectedModel = models.includes(options.model)
                                    ? options.model
                                    : models[0] || "select folder";
                                changeValue({model: selectedModel, is_own_model: value});
                            } else {
                                changeValue({model: "", is_own_model: !!value});
                            }
                        }}
                    />
                    <Label>from file</Label>
                </div>
            )}

            <div className="flex items-center space-x-2">
                <Checkbox
                    checked={options.allow_cpu_upscale}
                    onCheckedChange={(value) => {
                        changeValue({allow_cpu_upscale: !!value})
                    }}
                />
                <Label>allow cpu upscale</Label>
            </div>
        </div>
    )
}
