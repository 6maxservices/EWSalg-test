/**
 * Data Management Module
 * Handles CSV parsing, weekly aggregation, and gap detection.
 */

export const DataService = {
  /**
   * Parse CSV string into array of objects.
   * Expects columns: date, value
   */
  parseCSV: (csvString) => {
    // Simple parser for now, can be replaced with PapaParse in main.js if needed
    const lines = csvString.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    return lines.slice(1).map(line => {
      const values = line.split(',');
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = values[i]?.trim();
      });
      return obj;
    }).filter(row => row.date && !isNaN(parseFloat(row.value)));
  },

  /**
   * Aggregate daily data to weekly grain.
   * @param {Array} data - [{date, value}, ...]
   * @param {String} method - 'SUM' or 'AVG'
   * @returns {Array} - [{date (Monday), value}, ...]
   */
  aggregateToWeekly: (data, method = 'SUM') => {
    const weeklyMap = {};

    data.forEach(row => {
      const date = new Date(row.date);
      if (isNaN(date)) return;

      // Get Monday of that week using UTC to avoid day-shifts
      const day = date.getUTCDay();
      const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
      const dateStr = monday.toISOString().split('T')[0];

      if (!weeklyMap[dateStr]) {
        weeklyMap[dateStr] = { sum: 0, count: 0 };
      }
      weeklyMap[dateStr].sum += parseFloat(row.value);
      weeklyMap[dateStr].count += 1;
    });

    const sortedDates = Object.keys(weeklyMap).sort();
    return sortedDates.map(dateStr => ({
      date: dateStr,
      value: method === 'SUM' ? weeklyMap[dateStr].sum : weeklyMap[dateStr].sum / weeklyMap[dateStr].count
    }));
  },

  /**
   * Identify missing weeks in a sequence.
   * Returns a complete sequence with null values for missing weeks if "Keep Gaps" is active.
   */
  ensureWeeklySequence: (data) => {
    if (data.length === 0) return [];

    const result = [];
    const firstDate = new Date(data[0].date);
    const lastDate = new Date(data[data.length - 1].date);

    // Use UTC for the loop to avoid DST shifts
    let current = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), firstDate.getUTCDate()));
    const finalUTCHours = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate())).getTime();

    const dataIdxMap = new Map(data.map(d => [d.date, d.value]));

    while (current.getTime() <= finalUTCHours) {
      const dateStr = current.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        value: dataIdxMap.has(dateStr) ? dataIdxMap.get(dateStr) : null,
        isGap: !dataIdxMap.has(dateStr)
      });

      // Advance exactly 7 days in UTC
      current.setUTCDate(current.getUTCDate() + 7);
    }

    return result;
  },

  /**
   * Simple hash for dataset fingerprinting
   */
  getFingerprint: (data) => {
    const str = data.map(d => `${d.date}:${d.value}`).join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
};
