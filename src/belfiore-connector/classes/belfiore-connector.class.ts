import moment, { Moment } from "moment";
import IBelfioreCity from "../interfaces/belfiore-city.interface";
import IBelfioreCommonPlace from "../interfaces/belfiore-common-place.interface";
import IBelfioreCountry from "../interfaces/belfiore-country.interface";
import IBelfioreDB from "../interfaces/belfiore-db.interface";
import BelfioreConnectorConfig from "../types/belfiore-connector-config.type";
import BelfiorePlace from "../types/belfiore-place.type";
import MultiFormatDate from "../types/multi-format-date.type";

/**
 * Handler for cities and countries Dataset
 */
export default class BelfioreConnector {

    /**
     * Get Proxy
     * @param resource target resource
     * @param paramName property name to proxy
     * @returns Proxied property
     */
    public static get(resource: BelfioreConnector, paramName: string, receiver: any): BelfiorePlace | any {
        if (this.BELFIORE_CODE_MATCHER.test(paramName)) {
            const base32name = this.belfioreToInt(paramName)
                .toString(32)
                .padStart(3, "0");

            for (const sourceData of resource.data) {
                const index = this.binaryfindIndex(sourceData.belfioreCode, base32name);
                if (index >= 0) {
                    return this.locationByIndex(sourceData, index, resource.config);
                }
            }
        }

        if (
            (resource.codeMatcher || resource.province) && ["cities", "countries"].includes(paramName) ||
            paramName === "byProvince" && (
                resource.codeMatcher instanceof RegExp && resource.codeMatcher.test("Z000")
                || resource.province
            )
        ) {
            return;
        }
        return Reflect.get(resource, paramName, receiver);
    }

    /**
     * Binary find Index (works ONLY in sorted arrays)
     * @param {string} text Unique string of values of the same length (step)
     * @param {string} value Exact text to find
     * @param {number} start text start index for seeking the value
     * @param {number} end text end index for seeking the value
     * @param {number} step length of a single value to seek properly the text string
     * @returns {number} Found value Index or -1 if not found
     * @private
     */
    public static binaryfindIndex(
        sourceString: string,
        targetText: string,
        start: number = 0,
        end: number = sourceString.length - 1,
    ) {
        if (!sourceString.length) {
            return -1;
        }
        const rangedStart = Math.max(start, 0);
        const rangedEnd = Math.min(end, sourceString.length - 1);
        const currentLength = rangedEnd - rangedStart + 1;
        if (rangedStart > rangedEnd || currentLength % targetText.length) {
            return -1;
        }
        const targetIndex = rangedStart + Math.floor(currentLength / (2 * targetText.length)) * targetText.length;
        const targetValue = sourceString.substr(targetIndex, targetText.length);
        if (targetValue === targetText) {
            return Math.ceil((targetIndex + 1) / targetText.length) - 1;
        }
        if (targetText > targetValue) {
            return this.binaryfindIndex(sourceString, targetText, targetIndex + targetText.length, rangedEnd);
        }
        return this.binaryfindIndex(sourceString, targetText, rangedStart, targetIndex - 1);
    }

    /**
     * Converts belfiore code into an int
     */
    public static belfioreToInt(code: string): number {
        const upperCaseCode = code.toUpperCase();
        return (upperCaseCode.charCodeAt(0) - 65) * 10 ** 3 + parseInt(upperCaseCode.substr(1), 10);
    }

    /**
     * Converts int to belfiore code
     * @param {number} code Belfiore int code
     * @returns {string} Standard belfiore code
     * @private
     */
    public static belfioreFromInt(code: number): string {
        const charIndex = Math.floor(code / 10 ** 3);
        const char = String.fromCharCode(charIndex + 65);
        const numValue = code.toString().substr(-3);
        return `${char}${numValue.padStart(3, "0")}`;
    }

    /**
     * Converst Base 32 number of days since 01/01/1861 to Moment instance
     * @param {string} base32daysFrom1861 Base 32 number of days from 1861-01-01
     * @returns {Moment} Moment instance date
     * @private
     */
    public static decodeDate(base32daysFrom1861) {
        const italyBirthDatePastDays = parseInt(base32daysFrom1861, 32);
        return moment(this.ITALY_KINGDOM_BIRTHDATE).add(italyBirthDatePastDays, "days");
    }

    /**
     * Retrieve string at index posizion
     * @param {string} list concatenation of names
     * @param {number} index target name index
     * @returns {string} index-th string
     * @private
     */
    public static nameByIndex(list, index) {
        if (typeof list !== "string") {
            throw new Error("[BelfioreConnector.nameByIndex] Provided list is not a string");
        }
        if (!list.length) {
            throw new Error("[BelfioreConnector.nameByIndex] Provided list empty");
        }
        let startIndex = 0;
        let endIndex = list.indexOf("|", startIndex + 1);
        let counter = index;

        while (counter > 0 && endIndex > startIndex) {
            counter--;
            startIndex = endIndex + 1;
            endIndex = list.indexOf("|", startIndex + 1);
        }

        if (index < 0 || counter > 0) {
            throw new Error(`[BelfioreConnector.nameByIndex] Provided index ${index} is out range`);
        }

        if (!counter && endIndex < 0) {
            return list.substring(startIndex);
        }

        return list.substring(startIndex, endIndex);
    }

    /**
     * Retrieve location for the given index in the given subset
     * @param {string} resourceData concatenation of names
     * @param {number} index target name index
     * @returns {Object} location
     * @private
     */
    public static locationByIndex(resourceData, index, config: BelfioreConnectorConfig): BelfiorePlace {
        const belfioreIndex = index * 3;
        if (resourceData.belfioreCode.length - belfioreIndex < 3) {
            return null;
        }
        const belFioreInt = parseInt(resourceData.belfioreCode.substr(belfioreIndex, 3), 32);
        const belfioreCode = this.belfioreFromInt(belFioreInt);
        if (config.codeMatcher && !config.codeMatcher.test(belfioreCode)) {
            return null;
        }
        const code = resourceData.provinceOrCountry.substr(index * 2, 2);
        if (config.province && config.province !== code) {
            return null;
        }

        const dateIndex = index * 4;
        const creationDate = this.decodeDate((resourceData.creationDate || "")
            .substr(dateIndex, 4) || "0").startOf("day");
        const expirationDate = this.decodeDate((resourceData.expirationDate || "")
            .substr(dateIndex, 4) || "2qn13").endOf("day");
        if (
            config.activeDate &&
            (
                resourceData.creationDate && config.activeDate.isBefore(creationDate, "day") ||
                resourceData.expirationDate && config.activeDate.isAfter(expirationDate, "day")
            )
        ) {
            return null;
        }
        const name = this.nameByIndex(resourceData.name, index);
        const isCountry = belfioreCode[0] === "Z";
        const licenseIndex = parseInt(resourceData.dataSource, 32)
            .toString(2).padStart(resourceData.belfioreCode.length * 2 / 3, "0")
            .substr(index * 2, 2);
        const dataSource = config.licenses[parseInt(licenseIndex, 2)];

        const location: IBelfioreCommonPlace = {
            belfioreCode,
            creationDate: creationDate.toDate(),
            dataSource,
            expirationDate: expirationDate.toDate(),
            name,
        };
        if (isCountry) {
            return {
                ...location,
                iso3166: code,
            } as IBelfioreCountry;
        }
        return {
            ...location,
            province: code,
        } as IBelfioreCity;
    }

    private static ITALY_KINGDOM_BIRTHDATE = "1861-01-01";
    private static BELFIORE_CODE_MATCHER = /^[A-Z]\d{3}$/iu;

    private data: IBelfioreDB[];
    private licenses: string[];
    private activeDate: Moment | undefined;
    private codeMatcher: RegExp | undefined;
    private province: string | undefined;

    constructor({
        activeDate,
        codeMatcher,
        data,
        licenses,
        province,
    }: BelfioreConnectorConfig) {
        if (codeMatcher && province) {
            throw new Error("Both codeMatcher and province were provided to Bolfiore, only one is allowed");
        }

        this.activeDate = activeDate;
        this.codeMatcher = codeMatcher;
        this.data = data;
        this.licenses = licenses;
        this.province = province;

        return new Proxy(this, this.constructor);
    }

    /**
     * Return belfiore places list
     */
    public toArray(): BelfiorePlace[] {
        return Array.from(this.scanData());
    }

    /**
     * Search places matching given name
     */
    public searchByName(name: string): BelfiorePlace[] | null {
        return name ? Array.from(this.scanData(name)) : null;
    }

    /**
     * Find place matching given name, retuns place object if provided name match only 1 result
     */
    public findByName(name: string): BelfiorePlace | null {
        if (!name) {
            return null;
        }
        const startingNameMatcher = new RegExp(`^${name}$`, "i");
        return this.scanData(startingNameMatcher).next().value;
    }

    /**
     * Returns a Proxied version of Belfiore which filters results by given date
     * @param date Target date to filter places active only for the given date
     * @returns Belfiore instance filtered by active date
     * @public
     */
    public active(date: MultiFormatDate = moment()): BelfioreConnector {
        return new BelfioreConnector({
            ...this.config,
            activeDate: moment(date),
        });
    }

    /**
     * Returns a Belfiore instance filtered by the given province
     * @param {string} code Province Code (2 A-Z char)
     * @returns {BelfioreConnector} Belfiore instance filtered by province code
     * @public
     */
    public byProvince(code: string): BelfioreConnector | undefined {
        if (typeof code !== "string" || (/^[A-Z]{2}$/u).test(code)) {
            return;
        }
        return new BelfioreConnector({
            ...this.config,
            codeMatcher: undefined,
            province: code,
        });
    }

    /**
     * Returns a Proxied version of Belfiore which filters results by place type
     */
    public get cities(): BelfioreConnector {
        return new BelfioreConnector({
            ...this.config,
            codeMatcher: /^[A-Y]/u,
            province: undefined,
        });
    }

    /**
     * Returns a Proxied version of Belfiore which filters results by place type
     */
    public get countries(): BelfioreConnector {
        return new BelfioreConnector({
            ...this.config,
            codeMatcher: /^Z/u,
            province: undefined,
        });
    }

    private get config() {
        const {
            activeDate,
            codeMatcher,
            data,
            licenses,
        } = this;
        return {
            activeDate,
            codeMatcher,
            data,
            licenses,
        };
    }

    private* scanDataSourceIndex(dataSource: IBelfioreDB, matcher?: RegExp): Generator<number> {
        if (matcher) {
            for (let startIndex = 0, entryIndex = 0; startIndex < dataSource.name.length; entryIndex++) {
                const endIndex = dataSource.name.indexOf("|", startIndex + 1) + 1 || dataSource.name.length;
                const targetName = dataSource.name.substring(startIndex, endIndex - 1);
                if (matcher.test(targetName)) {
                    yield entryIndex;
                }
                // Moving to next entry to check
                startIndex = endIndex;
            }
        } else {
            const dsLength = dataSource.belfioreCode.length / 3;
            for (let index = 0; index < dsLength; index++) {
                yield index;
            }
        }
        return -1;
    }

    private* scanData(name?: string | RegExp): Generator<BelfiorePlace> {
        const constructor = this.constructor as (typeof BelfioreConnector);
        const nameMatcher = typeof name === "string" ? new RegExp(name, "i") : name;

        for (const sourceData of this.data) {
            const dataSourceScan = this.scanDataSourceIndex(sourceData, nameMatcher);
            for (const index of dataSourceScan) {
                const parsedPlace: BelfiorePlace = constructor.locationByIndex(sourceData, index, this.config);
                if (parsedPlace) {
                    yield parsedPlace;
                }
            }
        }
        return null;
    }
}