import {addInt32} from "./util";

export interface IHID {
    write(data: ArrayBuffer): Promise<void>;
    read(): Promise<Uint8Array>;
    close(): Promise<void>;
}

export const enum DapCmd {
    DAP_INFO = 0x00,
    DAP_LED = 0x01,
    DAP_CONNECT = 0x02,
    DAP_DISCONNECT = 0x03,
    DAP_TRANSFER_CONFIGURE = 0x04,
    DAP_TRANSFER = 0x05,
    DAP_TRANSFER_BLOCK = 0x06,
    DAP_TRANSFER_ABORT = 0x07,
    DAP_WRITE_ABORT = 0x08,
    DAP_DELAY = 0x09,
    DAP_RESET_TARGET = 0x0a,
    DAP_SWJ_PINS = 0x10,
    DAP_SWJ_CLOCK = 0x11,
    DAP_SWJ_SEQUENCE = 0x12,
    DAP_SWD_CONFIGURE = 0x13,
    DAP_JTAG_SEQUENCE = 0x14,
    DAP_JTAG_CONFIGURE = 0x15,
    DAP_JTAG_IDCODE = 0x16,
    DAP_VENDOR0 = 0x80,
}

export const enum Csw {
    CSW_SIZE = 0x00000007,
    CSW_SIZE8 = 0x00000000,
    CSW_SIZE16 = 0x00000001,
    CSW_SIZE32 = 0x00000002,
    CSW_ADDRINC = 0x00000030,
    CSW_NADDRINC = 0x00000000,
    CSW_SADDRINC = 0x00000010,
    CSW_PADDRINC = 0x00000020,
    CSW_DBGSTAT = 0x00000040,
    CSW_TINPROG = 0x00000080,
    CSW_HPROT = 0x02000000,
    CSW_MSTRTYPE = 0x20000000,
    CSW_MSTRCORE = 0x00000000,
    CSW_MSTRDBG = 0x20000000,
    CSW_RESERVED = 0x01000000,

    CSW_VALUE = (CSW_RESERVED | CSW_MSTRDBG | CSW_HPROT | CSW_DBGSTAT | CSW_SADDRINC),
}

export const enum DapVal {
    AP_ACC = 1 << 0,
    DP_ACC = 0 << 0,
    READ = 1 << 1,
    WRITE = 0 << 1,
    VALUE_MATCH = 1 << 4,
    MATCH_MASK = 1 << 5,
}

const enum Info {
    VENDOR_ID = 0x01,
    PRODUCT_ID = 0x02,
    SERIAL_NUMBER = 0x03,
    CMSIS_DAP_FW_VERSION = 0x04,
    TARGET_DEVICE_VENDOR = 0x05,
    TARGET_DEVICE_NAME = 0x06,
    CAPABILITIES = 0xf0,
    PACKET_COUNT = 0xfe,
    PACKET_SIZE = 0xff,
}

export const enum Reg {
    DP_0x0 = 0,
    DP_0x4 = 1,
    DP_0x8 = 2,
    DP_0xC = 3,
    AP_0x0 = 4,
    AP_0x4 = 5,
    AP_0x8 = 6,
    AP_0xC = 7,

    IDCODE = Reg.DP_0x0,
    ABORT = Reg.DP_0x0,
    CTRL_STAT = Reg.DP_0x4,
    SELECT = Reg.DP_0x8,

}

export const enum ApReg {
    CSW = 0x00,
    TAR = 0x04,
    DRW = 0x0C,

    IDR = 0xFC,
}

interface ICmdEntry {
    resolve: (v: Uint8Array) => void;
    data: number[];
}

export class Dap {
    private hid: IHID;

    private sent: ICmdEntry[] = [];
    private waiting: ICmdEntry[] = [];
    private maxSent = 1;

    constructor(hid: IHID) {
        this.hid = hid;
    }

    public async resetTarget() {
        return this.cmdNums(DapCmd.DAP_RESET_TARGET, []);
    }

    public async disconnect() {
        return this.cmdNums(DapCmd.DAP_DISCONNECT, []);
    }

    public async cmdNums(op: DapCmd, data: number[]) {
        // console.log(op);

        data.unshift(op);
        return this.send(data)
            .then((buf) => {
                // console.log(buf);

                if (buf[0] !== op) {
                    throw new Error(`Bad response for ${op} -> ${buf[0]}`);
                }

                switch (op) {
                    case DapCmd.DAP_CONNECT:
                    case DapCmd.DAP_INFO:
                    case DapCmd.DAP_TRANSFER:
                        break;
                    default:
                        if (buf[1] !== 0) {
                            throw new Error(`Bad status for ${op} -> ${buf[1]}`);
                        }
                }
                return buf;
            });
    }

    public async connect() {
        console.log("Connecting...");
        return this.info(Info.PACKET_COUNT)
            .then((v: number) => {
                this.maxSent = v;
            })
            .then(async () => this.cmdNums(DapCmd.DAP_SWJ_CLOCK, addInt32(null, 1000000)))
            .then(async () => this.cmdNums(DapCmd.DAP_CONNECT, [0]))
            .then(async (buf) => {
                if (buf[1] !== 1) {
                    // not SWD :'(

                    console.log(buf);
                    console.error("SWD mode not enabled.");
                }

                return this.cmdNums(DapCmd.DAP_SWJ_CLOCK, addInt32(null, 1000000));
            })
            .then(async () => this.cmdNums(DapCmd.DAP_TRANSFER_CONFIGURE, [0, 0x50, 0, 0, 0]))
            .then(async () => this.cmdNums(DapCmd.DAP_SWD_CONFIGURE, [0]))
            .then(async () => this.jtagToSwd())
            .then(() => console.log("Connected."));
    }

    private sendNums(lst: number[]) {
        lst.unshift(0);
        while (lst.length < 64) {
            lst.push(0);
        }

        this.send(lst);
    }

    private async jtagToSwd() {
        const arrs = [
            [56, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
            [16, 0x9e, 0xe7],
            [56, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
            [8, 0x00],
        ];

        for (const arr of arrs) {
            await this.swjSequence(arr);
        }
    }

    private async swjSequence(data: number[]) {
        return this.cmdNums(DapCmd.DAP_SWJ_SEQUENCE, data);
    }

    private async info(id: Info) {
        return this.cmdNums(DapCmd.DAP_INFO, [id])
            .then((buf) => {
                if (buf[1] === 0) {
                    return null;
                }

                switch (id) {
                    case Info.CAPABILITIES:
                    case Info.PACKET_COUNT:
                    case Info.PACKET_SIZE:
                        if (buf[1] === 1) {
                            return buf[2];
                        } else if (buf[1] === 2) {
                            return buf[3] << 8 | buf[2];
                        }
                }
                return buf.slice(2, buf[1] + 2 - 1); // .toString("utf8")
            });
    }

    private async send(command: number[]): Promise<Uint8Array> {
        const array = Uint8Array.from(command);

        return this.hid.write(array.buffer)
            .then(async (response) => this.hid.read())
            .then((response) => {
                return new Uint8Array(response.buffer);
            });
    }
}