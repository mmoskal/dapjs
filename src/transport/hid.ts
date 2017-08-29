
export interface IHID {
    write(data: ArrayBuffer): Promise<void>;
    read(): Promise<Uint8Array>;
    close(): Promise<void>;
    // sends each of commands and expects one packet in response
    // this makes for better performance when HID access is proxied
    sendMany?(commands: Uint8Array[]): Promise<Uint8Array[]>;
}
