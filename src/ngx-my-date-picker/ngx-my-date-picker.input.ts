import { Directive, Input, ComponentRef, ElementRef, ViewContainerRef, Renderer, ChangeDetectorRef, ComponentFactoryResolver, forwardRef, EventEmitter, Output, SimpleChanges, OnChanges, HostListener } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

import { IMyDate, IMyOptions, IMyDateModel, IMyCalendarViewChanged, IMyInputFieldChanged, IMySelectorPosition } from "./interfaces/index";
import { NgxMyDatePicker } from "./ngx-my-date-picker.component";
import { UtilService } from "./services/ngx-my-date-picker.util.service";
import { NgxMyDatePickerConfig } from "./services/ngx-my-date-picker.config";
import { CalToggle } from "./enums/cal-toggle.enum";
import { Year } from "./enums/year.enum";
import { KeyCode } from "./enums/key-code.enum";

const NGX_DP_VALUE_ACCESSOR = {
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => NgxMyDatePickerDirective),
    multi: true
};

@Directive({
    selector: "[ngx-mydatepicker]",
    exportAs: "ngx-mydatepicker",
    providers: [UtilService, NGX_DP_VALUE_ACCESSOR]
})
export class NgxMyDatePickerDirective implements OnChanges, ControlValueAccessor {
    @Input() options: IMyOptions;
    @Input() defaultMonth: string;

    @Output() dateChanged: EventEmitter<IMyDateModel> = new EventEmitter<IMyDateModel>();
    @Output() inputFieldChanged: EventEmitter<IMyInputFieldChanged> = new EventEmitter<IMyInputFieldChanged>();
    @Output() calendarViewChanged: EventEmitter<IMyCalendarViewChanged> = new EventEmitter<IMyCalendarViewChanged>();
    @Output() calendarToggle: EventEmitter<number> = new EventEmitter<number>();

    private cRef: ComponentRef<NgxMyDatePicker> = null;
    private inputText: string = "";
    private preventClose: boolean = false;

    private opts: IMyOptions;

    onChangeCb: (_: any) => void = () => { };
    onTouchedCb: () => void = () => { };

    constructor(private utilService: UtilService,
                private vcRef: ViewContainerRef,
                private cfr: ComponentFactoryResolver,
                private renderer: Renderer,
                private cdr: ChangeDetectorRef,
                private elem: ElementRef,
                private config: NgxMyDatePickerConfig) {
        this.opts = Object.assign({}, config);
        this.parseOptions(config);
    }

    @HostListener("keyup", ["$event"]) onKeyUp(evt: KeyboardEvent) {
        if (this.ignoreKeyPress(evt.keyCode)) {
            return;
        }
        else if (evt.keyCode === KeyCode.esc) {
            this.closeSelector(CalToggle.CloseByEsc);
        }
        else {
            let date: IMyDate = this.utilService.isDateValid(this.elem.nativeElement.value, this.opts.dateFormat, this.opts.minYear, this.opts.maxYear, this.opts.disableUntil, this.opts.disableSince, this.opts.disableWeekends, this.opts.disableDates, this.opts.disableDateRanges, this.opts.monthLabels, this.opts.enableDates);
            if (this.utilService.isInitializedDate(date)) {
                let dateModel: IMyDateModel = this.utilService.getDateModel(date, this.opts.dateFormat, this.opts.monthLabels);
                this.emitDateChanged(dateModel);
                this.updateModel(dateModel);
                this.emitInputFieldChanged(dateModel.formatted, true);
                if (this.opts.closeSelectorOnDateSelect) {
                    this.closeSelector(CalToggle.CloseByDateSel);
                }
                else if (this.cRef !== null) {
                    this.cRef.instance.setCalendarView(date);
                }
            }
            else {
                if (this.inputText !== this.elem.nativeElement.value) {
                    if (this.elem.nativeElement.value === "") {
                        this.clearDate();
                    }
                    else {
                        this.onChangeCb(null);
                        this.emitInputFieldChanged(this.elem.nativeElement.value, false);
                    }
                }
            }
            this.inputText = this.elem.nativeElement.value;
        }
    }

    @HostListener("blur") onBlur() {
        this.onTouchedCb();
    }

    @HostListener("document:click", ["$event"]) onClick(evt: MouseEvent) {
        if (this.opts.closeSelectorOnDocumentClick && !this.preventClose && evt.target && this.cRef !== null && this.elem.nativeElement !== evt.target && !this.cRef.location.nativeElement.contains(evt.target)) {
            this.closeSelector(CalToggle.CloseByOutClick);
        }
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes.hasOwnProperty("options")) {
            this.parseOptions(changes["options"].currentValue);
        }

        if (changes.hasOwnProperty("defaultMonth")) {
            let dm: any = changes["defaultMonth"].currentValue;
            if (typeof dm === "object") {
                dm = dm.defMonth;
            }
            this.defaultMonth = dm;
        }
    }

    public parseOptions(opts: IMyOptions): void {
        if (opts !== undefined) {
            Object.keys(opts).forEach((k) => {
                (<IMyOptions>this.opts)[k] = opts[k];
            });
        }
        if (this.opts.minYear < Year.min) {
            this.opts.minYear = Year.min;
        }
        if (this.opts.maxYear > Year.max) {
            this.opts.maxYear = Year.max;
        }
    }

    public writeValue(value: Object): void {
        if (value && (value["date"] || value["jsdate"])) {
            let formatted: string = this.utilService.formatDate(value["date"] ? value["date"] : this.jsDateToMyDate(value["jsdate"]), this.opts.dateFormat, this.opts.monthLabels);
            this.setInputValue(formatted);
            let date: IMyDate = this.utilService.isDateValid(formatted, this.opts.dateFormat, this.opts.minYear, this.opts.maxYear, this.opts.disableUntil, this.opts.disableSince, this.opts.disableWeekends, this.opts.disableDates, this.opts.disableDateRanges, this.opts.monthLabels, this.opts.enableDates);
            this.emitInputFieldChanged(formatted, this.utilService.isInitializedDate(date));
        }
        else if (value === null || value === "") {
            this.setInputValue("");
            this.emitInputFieldChanged("", false);
        }
    }

    public registerOnChange(fn: any): void {
        this.onChangeCb = fn;
    }

    public registerOnTouched(fn: any): void {
        this.onTouchedCb = fn;
    }

    public openCalendar(): void {
        this.preventClose = true;
        this.cdr.detectChanges();
        if (this.cRef === null) {
            this.cRef = this.vcRef.createComponent(this.cfr.resolveComponentFactory(NgxMyDatePicker));
            this.appendSelectorToBody(this.cRef.location.nativeElement);
            this.cRef.instance.initialize(
                this.opts,
                this.defaultMonth,
                this.getSelectorPosition(this.elem.nativeElement),
                this.elem.nativeElement.value,
                (dm: IMyDateModel, close: boolean) => {
                    this.emitDateChanged(dm);
                    this.updateModel(dm);
                    if (close) {
                        this.closeSelector(CalToggle.CloseByDateSel);
                    }
                },
                (cvc: IMyCalendarViewChanged) => {
                    this.emitCalendarChanged(cvc);
                },
                () => {
                    this.closeSelector(CalToggle.CloseByEsc);
                }
            );
            this.emitCalendarToggle(CalToggle.Open);
        }
        setTimeout(() => {
            this.preventClose = false;
        }, 50);
    }

    public closeCalendar(): void {
        this.closeSelector(CalToggle.CloseByCalBtn);
    }

    public toggleCalendar(): void {
        if (this.cRef === null) {
            this.openCalendar();
        }
        else {
            this.closeSelector(CalToggle.CloseByCalBtn);
        }
    }

    public clearDate(): void {
        this.emitDateChanged({date: {year: 0, month: 0, day: 0}, jsdate: null, formatted: "", epoc: 0});
        this.emitInputFieldChanged("", false);
        this.onChangeCb(null);
        this.onTouchedCb();
        this.setInputValue("");
        this.closeSelector(CalToggle.CloseByCalBtn);
    }

    private ignoreKeyPress(keyCode: number): boolean {
        return keyCode === KeyCode.leftArrow || keyCode === KeyCode.rightArrow || keyCode === KeyCode.upArrow || keyCode === KeyCode.downArrow || keyCode === KeyCode.tab || keyCode === KeyCode.shift;
    }

    private closeSelector(reason: number): void {
        if (this.cRef !== null) {
            this.vcRef.remove(this.vcRef.indexOf(this.cRef.hostView));
            this.cRef = null;
            this.emitCalendarToggle(reason);
        }
    }

    private updateModel(model: IMyDateModel): void {
        this.onChangeCb(model);
        this.onTouchedCb();
        this.setInputValue(model.formatted);
    }

    private setInputValue(value: string): void {
        this.inputText = value;
        this.renderer.setElementProperty(this.elem.nativeElement, "value", value);
    }

    private emitDateChanged(dateModel: IMyDateModel): void {
        this.dateChanged.emit(dateModel);
    }

    private emitInputFieldChanged(value: string, valid: boolean): void {
        this.inputFieldChanged.emit({value: value, dateFormat: this.opts.dateFormat, valid: valid});
    }

    private emitCalendarChanged(cvc: IMyCalendarViewChanged) {
        this.calendarViewChanged.emit(cvc);
    }

    private emitCalendarToggle(reason: number): void {
        this.calendarToggle.emit(reason);
    }

    private jsDateToMyDate(date: Date): IMyDate {
        return {year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate()};
    }

    private appendSelectorToBody(elem: any): void {
        document.querySelector("body").appendChild(elem);
    }

    private getSelectorPosition(elem: any): IMySelectorPosition {
        let b: any = document.body.getBoundingClientRect();
        let e: any = elem.getBoundingClientRect();

        let top: number = e.top - b.top;
        let left: number = e.left - b.left;

        if (this.opts.openSelectorTopOfInput) {
            top = top - this.getSelectorDimension(this.opts.selectorHeight) - 2;
        }
        else {
            top = top + elem.offsetHeight + (this.opts.showSelectorArrow ? 12 : 2);
        }

        if (this.opts.alignSelectorRight) {
            left = left + elem.offsetWidth - this.getSelectorDimension(this.opts.selectorWidth);
        }
        return {top: top + "px", left: left + "px"};
    }

    private getSelectorDimension(value: string): number {
        return Number(value.replace("px", ""));
    }
}