/* Settings page — instant file-select previews for the logo and signature. */
'use strict';

document.addEventListener('DOMContentLoaded', function () {

  function wirePreview(inputName, previewId, wrapId) {
    var input = document.querySelector('input[name="' + inputName + '"]');
    var preview = document.getElementById(previewId);
    if (!input || !preview) return;
    input.addEventListener('change', function () {
      if (!this.files || !this.files[0]) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        preview.src = e.target.result;
        if (wrapId) {
          var wrap = document.getElementById(wrapId);
          if (wrap) wrap.hidden = false;
        }
      };
      reader.readAsDataURL(this.files[0]);
    });
  }

  wirePreview('logo', 'logoPreview');
  wirePreview('signature', 'signaturePreview', 'signaturePreviewWrap');
});
