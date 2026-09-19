// Minimalni dodatek k lib.dom za File System Access API (Chrome/Edge), ki v
// standardnih TypeScript DOM tipih (še) ni v celoti zajet.
export {};

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: "read" | "readwrite";
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
  }

  interface Window {
    showDirectoryPicker(options?: {
      id?: string;
      mode?: "read" | "readwrite";
    }): Promise<FileSystemDirectoryHandle>;
  }
}
