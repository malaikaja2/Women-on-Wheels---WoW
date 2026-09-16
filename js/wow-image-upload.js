(function () {
  "use strict";

  const MB = 1024 * 1024;
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

  function extensionOf(name) {
    return String(name || "").split(".").pop().toLowerCase();
  }

  function validateImageFile(file, options = {}) {
    if (!file || file.size <= 0) throw new Error("invalid_file_size");
    const maxInputBytes = options.maxInputBytes || 10 * MB;
    if (file.size > maxInputBytes) throw new Error("image_too_large");
    const ext = extensionOf(file.name);
    if (!ALLOWED_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error("invalid_file_type");
    }
  }

  async function loadBitmap(file) {
    if ("createImageBitmap" in window) {
      return createImageBitmap(file);
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("invalid_image_content"));
      };
      image.src = url;
    });
  }

  async function optimizeImageFile(file, options = {}) {
    validateImageFile(file, options);
    const bitmap = await loadBitmap(file);
    const width = bitmap.width || bitmap.naturalWidth || 0;
    const height = bitmap.height || bitmap.naturalHeight || 0;
    if (!width || !height) throw new Error("invalid_image_content");

    const maxSide = options.maxSide || 1600;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("image_optimize_failed");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    if (typeof bitmap.close === "function") bitmap.close();

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", options.quality || 0.86);
    });
    if (!blob) throw new Error("image_optimize_failed");
    const maxOutputBytes = options.maxOutputBytes || 5 * MB;
    if (blob.size > maxOutputBytes) throw new Error("image_too_large");
    const baseName = String(file.name || "upload").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName || "upload"}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  }

  async function optimizeFileInput(input, options = {}) {
    if (!input || !input.files || !input.files.length) return null;
    const file = input.files[0];
    const profile = options.kind === "profile" || options.mode === "profile";
    const optimized = await optimizeImageFile(file, {
      maxSide: profile ? 800 : 1600,
      quality: profile ? 0.82 : 0.86,
      maxInputBytes: profile ? 6 * MB : 10 * MB,
      maxOutputBytes: profile ? 2 * MB : 5 * MB
    });
    if (typeof DataTransfer === "function") {
      const transfer = new DataTransfer();
      transfer.items.add(optimized);
      input.files = transfer.files;
    }
    return optimized;
  }

  async function optimizeForm(form, options = {}) {
    const inputs = Array.from(form.querySelectorAll('input[type="file"]'))
      .filter((input) => input.files && input.files.length);
    const results = [];
    for (const input of inputs) {
      if (typeof options.onItem === "function") options.onItem(input);
      const name = String(input.name || input.id || "").toLowerCase();
      const kind = name.includes("profile") ? "profile" : "document";
      results.push(await optimizeFileInput(input, { kind }));
    }
    return results;
  }

  function submitFormWithProgress(form, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", form.action);
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.setRequestHeader("Accept", "application/json");
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || typeof onProgress !== "function") return;
        onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
      };
      xhr.onload = () => {
        let payload = {};
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch {
          reject(new Error(xhr.status >= 200 && xhr.status < 300 ? "invalid_server_response" : "server_error"));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300 || payload.ok !== true) {
          reject(new Error(payload.error || "signup_failed"));
          return;
        }
        resolve(payload);
      };
      xhr.onerror = () => reject(new Error("firebase_unavailable"));
      xhr.send(new FormData(form));
    });
  }

  window.WowImageUpload = Object.freeze({
    optimizeFileInput,
    optimizeForm,
    submitFormWithProgress,
    validateImageFile
  });
})();
