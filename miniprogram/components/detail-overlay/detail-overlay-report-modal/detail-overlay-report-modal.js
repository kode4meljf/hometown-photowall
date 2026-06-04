const { relayInput } = require('../relay');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    reportReason: { type: String, value: '' },
    reportDetail: { type: String, value: '' },
    reportSubmitting: { type: Boolean, value: false },
  },

  methods: {
    noop() {},
    closeReportModal() {
      this.triggerEvent('close');
    },
    onReportDetailInput: relayInput('detailinput'),
    submitReport() {
      this.triggerEvent('submit');
    },
  },
});
