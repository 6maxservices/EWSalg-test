/**
 * Validation Metrics
 * Precision, Recall, Lead Time.
 */

export const MetricService = {
    /**
     * Calculate metrics based on alerts and events.
     * Lead time window: 4 weeks.
     */
    calculate: (alerts, events, leadTimeWeeks = 4) => {
        if (!alerts.length || !events.length) return null;

        let tp = 0; // True Positives: Alert matched by an event in lead window
        let fp = 0; // False Positives: Alert with no matching event
        let fn = 0; // False Negatives: Event with no preceding alert
        let leadTimes = [];

        const criticalAlerts = alerts.filter(a => a.alert === 'CRITICAL' || a.alert === 'WARNING');
        const eventDates = events.map(e => new Date(e.date).getTime());

        // 1. Calculate TP and FP
        criticalAlerts.forEach(alert => {
            const alertTime = new Date(alert.date).getTime();
            const windowEnd = alertTime + (leadTimeWeeks * 7 * 24 * 60 * 60 * 1000);

            const match = eventDates.find(et => et >= alertTime && et <= windowEnd);
            if (match) {
                tp++;
                leadTimes.push((match - alertTime) / (7 * 24 * 60 * 60 * 1000));
            } else {
                fp++;
            }
        });

        // 2. Calculate FN
        events.forEach(event => {
            const eventTime = new Date(event.date).getTime();
            const windowStart = eventTime - (leadTimeWeeks * 7 * 24 * 60 * 60 * 1000);

            const match = criticalAlerts.find(a => {
                const at = new Date(a.date).getTime();
                return at >= windowStart && at <= eventTime;
            });

            if (!match) fn++;
        });

        const precision = tp / (tp + fp) || 0;
        const recall = tp / (tp + fn) || 0;
        const avgLeadTime = leadTimes.length ? (leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : 0;

        return { precision, recall, avgLeadTime };
    }
};
