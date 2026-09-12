export type SensorStatus = 'Down' | 'Warning' | 'Up' | 'Acknowledged' | 'Paused' | 'Unknown';

export interface ParsedAlarm {
  id: string;
  originalIndex: number;
  raw: string;
  ip: string;
  device: string;
  sensor: string;
  sensorGroup: string;
  value: string;
  status: SensorStatus;
  statusEmoji: string;
  downtime?: string;
  message?: string;
}

export interface GroupedAlarms {
  key: string;
  status: SensorStatus;
  statusEmoji: string;
  sensorGroup: string;
  items: ParsedAlarm[];
}

export type SortOption = 'original' | 'ip' | 'device' | 'value';

export type TelegramTemplate =
  | 'grouped-standard'
  | 'grouped-compact'
  | 'clean-bullets'
  | 'noc-ticket';

export interface ParseOptions {
  boldValues?: boolean;
  emptyLinesBetweenItems?: boolean;
  sortBy?: SortOption;
  customHeaderPrefix?: string; // Default: "# "
  removeDuplicates?: boolean;
  includeStatusInLine?: boolean;
  template?: TelegramTemplate;
  includeDowntime?: boolean;
  includeIp?: boolean;
  stripVerboseMessage?: boolean;
}

export const STATUS_META: Record<SensorStatus, { emoji: string; priority: number; badgeColor: string; label: string }> = {
  Down: { emoji: '🔴', priority: 1, badgeColor: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400', label: 'Down' },
  Warning: { emoji: '🟡', priority: 2, badgeColor: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400', label: 'Warning' },
  Acknowledged: { emoji: '🟠', priority: 3, badgeColor: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400', label: 'Acknowledged' },
  Paused: { emoji: '⏸️', priority: 4, badgeColor: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400', label: 'Paused' },
  Unknown: { emoji: '❓', priority: 5, badgeColor: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400', label: 'Unknown' },
  Up: { emoji: '🟢', priority: 6, badgeColor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400', label: 'Up' },
};

/**
 * Normalizes sensor name into a broad category (Group)
 * e.g., 'Disk D:', 'Disk C', 'Drive E' -> 'Disk'
 *       'Memory', 'Meminfo', 'RAM' -> 'Memory'
 *       'CPU Load', 'CPU' -> 'CPU'
 *       'Port 6379', 'Port 80' -> 'Port'
 */
export const MEASUREMENT_REGEX = /^(\d+(?:\.\d+)?)\s*(%|(?:mbit\/s|kbit\/s|gbit\/s|mbps|kbps|gbps|bps|bytes?\/s|kb\/s|mb\/s|gb\/s|msec|ms|s|sec|tb|gb|mb|kb|gbyte|mbyte|kbyte|rpm|err|req\/s|items)\b)/i;
export const MEASUREMENT_ANYWHERE_REGEX = /\b(\d+(?:\.\d+)?)\s*(%|(?:mbit\/s|kbit\/s|gbit\/s|mbps|kbps|gbps|bps|bytes?\/s|kb\/s|mb\/s|gb\/s|msec|ms|s|sec|tb|gb|mb|kb|gbyte|mbyte|kbyte|rpm|err|req\/s|items)\b)/i;

/**
 * Infers sensor name and sensor group from measurement value units
 * e.g. "13 Mbit/s" -> Traffic, "200 msec" -> Ping, "5%" -> Disk
 */
export function inferSensorFromValue(val: string): { sensor: string; group: string } {
  const lower = (val || '').toLowerCase();
  if (/mbit\/s|kbit\/s|gbit\/s|mbps|kbps|gbps|bps|bytes?\/s|kb\/s|mb\/s|gb\/s/i.test(lower)) {
    return { sensor: 'Traffic', group: 'Traffic' };
  }
  if (/msec|ms\b/i.test(lower)) {
    return { sensor: 'Ping', group: 'Ping' };
  }
  if (/%/i.test(lower)) {
    return { sensor: 'Disk', group: 'Disk' };
  }
  if (/rpm/i.test(lower)) {
    return { sensor: 'Fan', group: 'Hardware' };
  }
  return { sensor: 'Ping', group: 'Ping' };
}

/**
 * Normalizes sensor name into a broad category (Group)
 * e.g., 'Disk D:', 'Disk C', 'Drive E' -> 'Disk'
 *       'Memory', 'Meminfo', 'RAM' -> 'Memory'
 *       'CPU Load', 'CPU' -> 'CPU'
 *       'Port 6379', 'Port 80' -> 'Port'
 * When sensor is unknown or placeholder, infers from value or status.
 */
export function normalizeSensorGroup(sensorName: string, value: string = '', status: SensorStatus = 'Down'): string {
  const clean = (sensorName || '').trim().toLowerCase();
  const valClean = (value || '').trim().toLowerCase();

  // 1. Specific sensor categories
  if (/disk|drive|storage|volume|partition|hdd|ssd|nvme|\b[c-z]:\b/i.test(clean)) {
    return 'Disk';
  }
  if (/memory|meminfo|ram|swap|pagefile/i.test(clean)) {
    return 'Memory';
  }
  if (/cpu|processor|core|utilization/i.test(clean)) {
    return 'CPU';
  }
  if (/port|tcp|udp|socket|http|https|ssl|dns/i.test(clean)) {
    return 'Port';
  }
  if (/ping|icmp|packet|latency|rtt|loss|echo/i.test(clean)) {
    return 'Ping';
  }
  if (/traffic|bandwidth|\bbw\b|ethernet|nic|interface|gigabit|fastethernet|tengigabit|eth\d|ens\d|snmp traffic|gre-|to-afranet/i.test(clean)) {
    return 'Traffic';
  }
  if (/service|daemon|process|iis|mssql|mysql|nginx|docker|\bsrv\b|app pool|\.com\b/i.test(clean)) {
    return 'Service';
  }
  if (/uptime|system health/i.test(clean)) {
    return 'System';
  }

  // 2. Value-based inference if sensor name is ambiguous or generic
  if (/mbit\/s|kbit\/s|gbit\/s|mbps|kbps|gbps|bps|bytes?\/s|kb\/s|mb\/s|gb\/s/i.test(valClean)) {
    return 'Traffic';
  }
  if (/msec|ms\b/i.test(valClean)) {
    return 'Ping';
  }
  if (/%/i.test(valClean)) {
    if (/mem/i.test(clean)) return 'Memory';
    return 'Disk';
  }

  // 3. Fallback for generic or placeholder words (never output Down/Warning/Sensor as category)
  if (!clean || /^(down|warning|up|sensor|sensors|unknown|unknown sensor|status|state|device|devices|value|general)$/i.test(clean)) {
    return status === 'Down' ? 'Ping' : (value ? inferSensorFromValue(value).group : 'Ping');
  }

  // Fallback: take the first titlecased word or clean sensor
  const firstWord = sensorName.trim().split(/[\s:_-]+/)[0];
  if (firstWord && firstWord.length > 2 && !/^(down|warning|up|sensor|status|device)$/i.test(firstWord)) {
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
  }
  return 'Ping';
}

/**
 * Strips markdown link syntax [text](url) -> text
 */
export function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

/**
 * Checks if a string is a downtime duration e.g. "1 h 20 m", "10 s", "2 d 1 h", "45 m", "3 h"
 */
export function isDowntimeDuration(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  return (
    /^(\d+\s*[ywdhms]\s*,?\s*)+$/i.test(trimmed) ||
    /^\d+\s*(days?|hours?|mins?|minutes?|secs?|seconds?)$/i.test(trimmed) ||
    /^\d+:\d+(:\d+)?$/.test(trimmed) ||
    /^\d+\s*d\s*\d+\s*h/i.test(trimmed)
  );
}

/**
 * Checks if a string is a typical PRTG sensor measurement value
 * e.g. "8 %", "14%", "79 msec", "12 ms", "13 Mbit/s", "1.5 GB", "0 err", "100"
 */
export function isSensorValue(str: string): boolean {
  const trimmed = stripMarkdownLinks(str).replace(/\[|\]/g, '').trim();
  if (!trimmed) return false;
  if (isDowntimeDuration(trimmed)) return false;

  // Values with units like %, msec, ms, mbit/s, kbps, gbps, kb, mb, gb, rpm, etc.
  if (MEASUREMENT_REGEX.test(trimmed)) {
    return true;
  }
  // Plain numeric or count
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Extracts IPv4 address from string
 */
export function extractIp(text: string): string | null {
  const ipMatch = text.match(/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/);
  return ipMatch ? ipMatch[0] : null;
}

/**
 * Compare two IP addresses numerically by octets
 */
export function compareIps(ipA: string, ipB: string): number {
  const octetsA = ipA.split('.').map((o) => parseInt(o, 10));
  const octetsB = ipB.split('.').map((o) => parseInt(o, 10));

  if (octetsA.length !== 4 || octetsB.length !== 4) {
    return ipA.localeCompare(ipB);
  }

  for (let i = 0; i < 4; i++) {
    const diff = octetsA[i] - octetsB[i];
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Cleans and detects status from token
 */
export function detectStatus(token: string): SensorStatus | null {
  const lower = token.trim().toLowerCase();
  if (!lower) return null;
  if (/\b(down|unreachable|critical|alarm)\b/i.test(lower)) return 'Down';
  if (/\b(warn(ing)?|degraded)\b/i.test(lower)) return 'Warning';
  if (/\b(ack(nowledged)?)\b/i.test(lower)) return 'Acknowledged';
  if (/\b(pause(d)?)\b/i.test(lower)) return 'Paused';
  if (/\b(up|ok|good|healthy|normal)\b/i.test(lower)) return 'Up';
  if (/\b(unknown|unusual)\b/i.test(lower)) return 'Unknown';
  return null;
}

/**
 * Parses Device token, resolving breadcrumbs like:
 * "[Data Center » FL-DC » [172.21.3.143 FL-API-1](...)]"
 * or "Data Center > 172.21.3.143 FL-API-1"
 */
export function parseDeviceAndIp(rawToken: string, fallbackIp?: string | null): { ip: string; device: string } {
  // First extract nested markdown links if any
  let text = stripMarkdownLinks(rawToken).trim();

  // If there are nested brackets like [[172.21.3.143 FL-API-1]], clean them
  text = text.replace(/\[/g, ' ').replace(/\]/g, ' ').trim();

  // If there's a breadcrumb arrow like » or > or ->, isolate the last part
  const segments = text.split(/[»>→]/);
  const lastSegment = (segments[segments.length - 1] || text).trim();

  // Check if IP is in the last segment
  const ip = extractIp(lastSegment) || extractIp(text) || fallbackIp || '';

  // Extract device name by removing the IP and trailing/leading separators
  let device = lastSegment;
  if (ip) {
    device = device.replace(ip, '').trim();
  }

  // Clean separators from device name: "- FL-API-1" or "FL-API-1:" or "(FL-API-1)"
  device = device.replace(/^[-–—:\s()]+|[-–—:\s()]+$/g, '').trim();

  // If device is still empty, try previous segments
  if (!device && segments.length > 1) {
    const prevSegment = segments[segments.length - 2].trim();
    device = prevSegment.replace(/^[-–—:\s()]+|[-–—:\s()]+$/g, '').trim();
  }

  // If still empty and text exists, fallback
  if (!device) {
    device = ip ? `Device-${ip.split('.').pop()}` : 'Unknown-Device';
  }

  return { ip, device };
}

/**
 * Cleans sensor name: removes trailing colons, markdown brackets, or verbose PRTG error explanations
 */
export function cleanSensorName(sensor: string): string {
  let cleaned = stripMarkdownLinks(sensor).trim();
  cleaned = cleaned.replace(/\[|\]/g, '').trim();
  cleaned = cleaned.replace(/:+$/, '').trim();
  // Remove verbose explanations if inadvertently placed in the sensor cell
  cleaned = cleaned.replace(/\s*\(?(?:is\s+(?:below|above)\s+the\s+(?:error|warning)\s+limit.*)\)?/i, '').trim();
  return cleaned;
}

/**
 * Normalizes value: extracts concise reading or state,
 * completely stripping redundant PRTG verbose limit warnings such as:
 * "10% (Free Space) is below the warning limit of 10% in Free Space" -> "10%"
 * "3 % (Physical Free Percent) is below the error limit of 5 % in Physical Free Percent" -> "3%"
 * "1 % (Total) is below the warning limit of 2 % in Total" -> "1%"
 * "201 msec (Ping Time) is above the error limit of 200 msec in Ping Time" -> "201 msec"
 * "13 Mbit/s (Traffic Total) is above the error limit of 4 Mbit/s in Traffic Total" -> "13 Mbit/s"
 * "Connection refused (socket error # 10061)" -> "Connection refused"
 * "This service is either not installed on the target system or it is stopped (code: PE207)" -> "Stopped"
 */
export function cleanValue(value: string): string {
  if (!value) return '';
  let cleaned = stripMarkdownLinks(value).trim();
  cleaned = cleaned.replace(/\[|\]/g, '').trim();

  // 1. If value begins with a measurement followed by "is (below|above) the limit" or parenthesized sensor context
  const limitPrefixMatch = cleaned.match(
    /^((?:>|<)?\s*\d+(?:[.,]\d+)?\s*(?:%|mbit\/s|gbit\/s|kbit\/s|mbps|kbps|gbps|msec|ms|d|h|m|s|gbyte|mbyte|kbyte|#))\s*(?:\([^)]*\))?\s*is\s+(?:below|above)\s+the\s+(?:error|warning)\s+limit/i
  );
  if (limitPrefixMatch) {
    return limitPrefixMatch[1].replace(/(\d+)\s+%/g, '$1%').trim();
  }

  // 2. Any string containing "is (below|above) the (warning|error) limit"
  if (/is\s+(?:below|above)\s+the\s+(?:warning|error)\s+limit/i.test(cleaned)) {
    const m = cleaned.match(/(>|<)?\s*\d+(?:[.,]\d+)?\s*(?:%|mbit\/s|gbit\/s|kbit\/s|mbps|kbps|gbps|msec|ms|gbyte|mbyte|kbyte)/i);
    if (m) {
      return m[0].replace(/(\d+)\s+%/g, '$1%').trim();
    }
  }

  // 3. Remove verbose parenthesized descriptions from PRTG sensors
  cleaned = cleaned
    .replace(/\s*\((?:free space|physical free percent|total|percent available memory|traffic total|ping time|system|live|memory)\)\s*/gi, ' ')
    .trim();

  // 4. Socket and Service error text simplifications
  if (/connection refused/i.test(cleaned)) {
    return 'Connection refused';
  }
  if (/service is either not installed|is stopped|stopped\s*\(code|not running/i.test(cleaned)) {
    return 'Stopped';
  }
  if (/request timed out|socket timeout/i.test(cleaned)) {
    return 'Request timed out';
  }
  if (/no response from snmp|snmp agent not responding/i.test(cleaned)) {
    return 'SNMP Timeout';
  }
  if (/host unreachable|unreachable host/i.test(cleaned)) {
    return 'Host unreachable';
  }

  // 5. Clean extra whitespace before %
  cleaned = cleaned.replace(/(\d+)\s+%/g, '$1%').trim();

  return cleaned;
}

/**
 * Parses tab-delimited PRTG tables (copy-pasted directly from PRTG web interface).
 * Handles multiline cells (probe trees, downtime, error messages, and graphs).
 */
export function parsePrtgTabDelimited(text: string): ParsedAlarm[] | null {
  if (!text.includes('\t')) return null;
  const cells = text.split('\t');
  if (cells.length < 4) return null;

  // 1. Try finding explicit PRTG header row
  let headerColIndices: Record<string, number> | null = null;
  let stride = 0;
  let dataStartIndex = -1;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i].trim().toLowerCase();
    if (
      c.includes('probe group device') ||
      (c.includes('device') && (cells[i + 1]?.toLowerCase().includes('sensor') || cells[i + 2]?.toLowerCase().includes('sensor'))) ||
      (c.includes('sensor') && (cells[i + 1]?.toLowerCase().includes('value') || cells[i + 1]?.toLowerCase().includes('status')))
    ) {
      let start = i;
      if (i > 0 && /down for|downtime/i.test(cells[i - 1])) {
        start = i - 1;
      }

      const hMap: Record<string, number> = {};
      let j = start;
      while (j < cells.length) {
        const hj = cells[j].trim().toLowerCase();
        if (/down for|downtime|duration/i.test(hj)) hMap.downtime = j - start;
        else if (/probe group device|device|host|group/i.test(hj)) hMap.device = j - start;
        else if (/sensor/i.test(hj)) hMap.sensor = j - start;
        else if (/last value|value|reading/i.test(hj)) hMap.value = j - start;
        else if (/status|state/i.test(hj)) hMap.status = j - start;
        else if (/message|error/i.test(hj)) hMap.message = j - start;
        else if (/priority/i.test(hj)) hMap.priority = j - start;
        else if (/graph/i.test(hj)) hMap.graph = j - start;
        else {
          if (j > start + 3) break;
        }
        j++;
      }
      stride = j - start;
      headerColIndices = hMap;
      dataStartIndex = j;
      break;
    }
  }

  const alarms: ParsedAlarm[] = [];
  let rowIdx = 0;

  if (headerColIndices && stride > 0 && dataStartIndex !== -1) {
    for (let idx = dataStartIndex; idx < cells.length; idx += stride) {
      const rowCells = cells.slice(idx, idx + stride);
      if (rowCells.length === 0) continue;

      const statusCell = headerColIndices.status !== undefined ? rowCells[headerColIndices.status] : '';
      let status = (statusCell && detectStatus(statusCell)) || null;

      const deviceCell = headerColIndices.device !== undefined ? rowCells[headerColIndices.device] : '';
      const sensorCell = headerColIndices.sensor !== undefined ? rowCells[headerColIndices.sensor] : '';
      const valueCell = headerColIndices.value !== undefined ? rowCells[headerColIndices.value] : '';

      if (!status) {
        for (const rc of rowCells) {
          const st = detectStatus(rc.trim());
          if (st && rc.trim().length <= 15) {
            status = st;
            break;
          }
        }
      }

      const parsedDev = parseDeviceAndIp(deviceCell || '');
      const sensor = cleanSensorName(sensorCell || '');

      if (!parsedDev.ip && !parsedDev.device && !sensor && !status) {
        continue;
      }

      const finalStatus = status || 'Down';
      let val = cleanValue(valueCell || '');
      if (!val || val === '0%') {
        val = finalStatus === 'Down' ? 'Down' : 'Warning';
      }

      const finalSensor = sensor || 'Ping';
      const sensorGroup = normalizeSensorGroup(finalSensor, val, finalStatus);

      alarms.push({
        id: `alarm-${rowIdx}-${parsedDev.ip || 'no-ip'}-${finalSensor}`,
        originalIndex: rowIdx++,
        raw: rowCells.join('\t').trim(),
        ip: parsedDev.ip,
        device: parsedDev.device,
        sensor: finalSensor,
        sensorGroup,
        value: val,
        status: finalStatus,
        statusEmoji: STATUS_META[finalStatus].emoji,
      });
    }

    if (alarms.length > 0) return deduplicateAlarms(alarms);
  }

  // 2. Pure status cells pattern (when no header row was selected)
  const statusCells: { idx: number; status: SensorStatus }[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i].trim();
    if (c.length > 0 && c.length <= 15) {
      const st = detectStatus(c);
      if (st && /^(down|warning|up|paused|acknowledged|unknown)$/i.test(c)) {
        statusCells.push({ idx: i, status: st });
      }
    }
  }

  if (statusCells.length === 0) return null;

  for (let k = 0; k < statusCells.length; k++) {
    const { idx: stIdx, status } = statusCells[k];
    const prevStIdx = k > 0 ? statusCells[k - 1].idx : -1;
    const valueCell = stIdx > prevStIdx + 1 ? cells[stIdx - 1] : '';
    const sensorCell = stIdx > prevStIdx + 2 ? cells[stIdx - 2] : '';
    const deviceCell = stIdx > prevStIdx + 3 ? cells[stIdx - 3] : '';

    const parsedDev = parseDeviceAndIp(deviceCell || '');
    const sensor = cleanSensorName(sensorCell || '');
    let val = cleanValue(valueCell || '');
    if (!val || val === '0%') {
      val = status === 'Down' ? 'Down' : 'Warning';
    }

    const finalSensor = sensor || 'Ping';
    const sensorGroup = normalizeSensorGroup(finalSensor, val, status);

    alarms.push({
      id: `alarm-${rowIdx}-${parsedDev.ip || 'no-ip'}-${finalSensor}`,
      originalIndex: rowIdx++,
      raw: cells.slice(Math.max(0, stIdx - 4), stIdx + 2).join('\t').trim(),
      ip: parsedDev.ip,
      device: parsedDev.device,
      sensor: finalSensor,
      sensorGroup,
      value: val,
      status,
      statusEmoji: STATUS_META[status].emoji,
    });
  }

  return alarms.length > 0 ? deduplicateAlarms(alarms) : null;
}

const PRTG_NOISE_LINE = /^(sensors?\s+with\s+alarms?|show\s+alarms?|any\s+object|tagged\s+with|\d+\s+to\s+\d+\s+of\s+\d+|probe\s+group\s+device|last\s+value|status|message|priority|graph|down\s+for|downtime|no\s+data|free\s+space|traffic\s+total|ping\s+time|request\s+timed\s+out|icmp\s+error|office\s*\(|local\s*probe|error\s+limit|warning\s+limit|is\s+(?:above|below)\s+the)/i;
const IS_ERROR_MSG = /(?:is (?:above|below) the (?:error|warning) limit|error limit of|warning limit of)/i;
const IS_DOWNTIME_LINE = /^\d+\s+(?:h|m|s|d)(?:\s+\d+\s+(?:h|m|s|d))*$/i;

/**
 * Parses PRTG Historic / Event Log Table copy-paste
 * Format:
 * [Date/Time] \t [Device] \t [Sensor Type] \t [Sensor Name] \t [Status] \t [Message/Value]
 * e.g. 9/11/2026 9:33:17 PM \t 172.21.3.77 Rds-Any-2 \t SNMP Linux Meminfo \t Meminfo \t Down \t 3 % (Physical Free Percent)...
 */
export function parsePrtgLogTable(text: string): ParsedAlarm[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const PRTG_LOG_DATE_REGEX = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?/i;
  const IP_START_REGEX = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(.+)$/;

  let hasLogDate = false;
  for (const line of lines) {
    if (PRTG_LOG_DATE_REGEX.test(line)) {
      hasLogDate = true;
      break;
    }
  }
  if (!hasLogDate) return null;

  const alarms: ParsedAlarm[] = [];
  let rowIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!PRTG_LOG_DATE_REGEX.test(line)) continue;

    const cols = line.split(/\t/).map((c) => c.trim());
    const date = cols[0];
    const deviceCol = cols[1] || '';
    const sensorTypeCol = cols[2] || '';
    const sensorNameCol = cols[3] || '';
    const statusCol = cols[4] || '';
    let messageCol = cols[5] || '';

    // If message is on subsequent line(s)
    if (!messageCol && i + 1 < lines.length && !PRTG_LOG_DATE_REGEX.test(lines[i + 1]) && !IP_START_REGEX.test(lines[i + 1])) {
      messageCol = lines[i + 1];
    }

    const status = detectStatus(statusCol) || detectStatus(messageCol) || 'Up';
    const parsedDev = parseDeviceAndIp(deviceCol);

    let sensorName = cleanSensorName(sensorNameCol);
    if (!sensorName || sensorName === 'Unknown Sensor' || sensorName === 'Sensor') {
      sensorName = cleanSensorName(sensorTypeCol);
    }
    if (!sensorName) sensorName = 'Ping';

    let val = '';
    if (messageCol) {
      const pctMatch = messageCol.match(/(\d+(?:\.\d+)?\s*%)/);
      const mbitMatch = messageCol.match(/(\d+(?:,\d+)?(?:\.\d+)?\s*(?:mbit\/s|gbit\/s|kbit\/s|mbps|kbps))/i);
      const msecMatch = messageCol.match(/(\d+(?:\.\d+)?\s*(?:msec|ms))/i);
      const connRefused = /connection refused/i.test(messageCol);
      const stoppedMatch = /stopped/i.test(messageCol);

      if (pctMatch) {
        val = cleanValue(pctMatch[1]);
      } else if (mbitMatch) {
        val = cleanValue(mbitMatch[1]);
      } else if (msecMatch) {
        val = cleanValue(msecMatch[1]);
      } else if (connRefused) {
        val = 'Connection refused';
      } else if (stoppedMatch) {
        val = 'Stopped';
      } else if (/active|running/i.test(messageCol)) {
        val = 'Active';
      } else {
        val = messageCol.length > 35 ? messageCol.slice(0, 35) + '...' : messageCol;
      }
    }

    if (!val) {
      val = status;
    }

    const sensorGroup = normalizeSensorGroup(sensorName, val, status);

    alarms.push({
      id: `log-${rowIdx++}-${parsedDev.ip || 'no-ip'}-${sensorName}`,
      originalIndex: rowIdx,
      raw: line,
      ip: parsedDev.ip,
      device: parsedDev.device,
      sensor: sensorName,
      sensorGroup,
      value: val,
      status,
      statusEmoji: STATUS_META[status]?.emoji || '🔴',
      downtime: date,
    });
  }

  return alarms.length > 0 ? deduplicateAlarms(alarms) : null;
}

/**
 * Parses PRTG Device Tree Overview
 * Format:
 * [IP] [DeviceName]
 * [SensorName]
 * [Value]
 * e.g.
 * 172.21.2.21 ESXi 1
 * CPU
 * 14 %
 * Memory
 * 20 %
 * Uptime
 * 286 d
 * BW
 * 1,328 Mbit/s
 * Disk OS
 * >99 %
 */
export function parsePrtgDeviceTree(text: string): ParsedAlarm[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const PRTG_LOG_DATE_REGEX = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?/i;
  const IP_START_REGEX = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(.+)$/;

  let deviceMatchCount = 0;
  for (const line of lines) {
    if (IP_START_REGEX.test(line)) deviceMatchCount++;
  }
  if (deviceMatchCount < 2) return null;

  const alarms: ParsedAlarm[] = [];
  let currentDev: { ip: string; device: string } | null = null;
  let rowIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (PRTG_LOG_DATE_REGEX.test(line)) continue;

    const ipMatch = line.match(IP_START_REGEX);
    if (ipMatch) {
      currentDev = {
        ip: ipMatch[1],
        device: ipMatch[2].trim(),
      };
      continue;
    }

    if (!currentDev) continue;

    if (/paused by user/i.test(line)) {
      const sensor = 'Device Status';
      const val = 'Paused by user';
      const status: SensorStatus = 'Paused';
      const group = 'System';
      alarms.push({
        id: `devtree-${rowIdx++}-${currentDev.ip}-${sensor}`,
        originalIndex: rowIdx,
        raw: `${currentDev.ip} ${currentDev.device} - ${sensor}: ${val}`,
        ip: currentDev.ip,
        device: currentDev.device,
        sensor,
        sensorGroup: group,
        value: val,
        status,
        statusEmoji: STATUS_META[status]?.emoji || '⏸️',
      });
      continue;
    }

    const nextLine = lines[i + 1];
    if (nextLine && !nextLine.match(IP_START_REGEX) && !PRTG_LOG_DATE_REGEX.test(nextLine)) {
      if (
        /^(>|<)?\s*\d+(\.\d+)?\s*(%|mbit\/s|gbit\/s|kbit\/s|mbps|kbps|msec|ms|d|h|m|s|gbyte|mbyte|kbyte|#)/i.test(nextLine) ||
        /^(running|active|stopped|down|warning|up|ok|paused)/i.test(nextLine)
      ) {
        const sensorName = line;
        const val = nextLine;
        let status: SensorStatus = 'Up';

        const pctMatch = val.match(/^(?:>|<)?\s*(\d+)\s*%/);
        if (pctMatch) {
          const pct = parseInt(pctMatch[1], 10);
          if (val.includes('>99') || pct >= 95) {
            status = 'Down';
          } else if (pct >= 85) {
            status = 'Warning';
          }
        } else if (/stopped/i.test(val)) {
          status = 'Down';
        } else if (/paused/i.test(val)) {
          status = 'Paused';
        }

        const group = normalizeSensorGroup(sensorName, val, status);

        alarms.push({
          id: `devtree-${rowIdx++}-${currentDev.ip}-${sensorName}`,
          originalIndex: rowIdx,
          raw: `${currentDev.ip} ${currentDev.device} - ${sensorName}: ${val}`,
          ip: currentDev.ip,
          device: currentDev.device,
          sensor: sensorName,
          sensorGroup: group,
          value: cleanValue(val),
          status,
          statusEmoji: STATUS_META[status]?.emoji || '🟢',
        });

        i++; // skip nextLine
        continue;
      }
    }
  }

  return alarms.length > 0 ? deduplicateAlarms(alarms) : null;
}

/**
 * Parses raw PRTG text (tables, TSV, markdown, free-form, or mixed) into structured ParsedAlarm list
 */
export function parsePrtgRawOutput(rawInput: string): ParsedAlarm[] {
  if (!rawInput || !rawInput.trim()) return [];

  // 1. Check if input contains PRTG event/log lines (e.g. "9/11/2026 9:33:47 PM \t 172.21.3.77 Rds-Any-2 ...")
  const logAlarms = parsePrtgLogTable(rawInput);

  // 2. Check if input contains PRTG device tree overview (e.g. "172.21.2.21 ESXi 1 \n CPU \n 14 % ...")
  const treeAlarms = parsePrtgDeviceTree(rawInput);

  if (logAlarms || treeAlarms) {
    const combined = [...(logAlarms || []), ...(treeAlarms || [])];
    if (combined.length > 0) {
      return deduplicateAlarms(combined);
    }
  }

  // 3. Check if input is a tab-delimited PRTG web table copy
  const tabDelimitedAlarms = parsePrtgTabDelimited(rawInput);
  if (tabDelimitedAlarms && tabDelimitedAlarms.length > 0) {
    return tabDelimitedAlarms;
  }

  const lines = rawInput.split(/\r?\n/);
  const alarms: ParsedAlarm[] = [];

  let headerMap: {
    downtimeIdx?: number;
    deviceIdx?: number;
    sensorIdx?: number;
    valueIdx?: number;
    statusIdx?: number;
    messageIdx?: number;
  } | null = null;

  // Intermediate raw items list
  interface CandidateItem {
    lineIndex: number;
    rawLine: string;
    ip: string;
    device: string;
    sensor: string;
    value: string;
    status: SensorStatus;
    downtime?: string;
    isDeviceOnly: boolean;
    isValueOnly: boolean;
  }

  const rawItems: CandidateItem[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex].trim();
    if (!rawLine) continue;

    // Skip markdown table separator lines: |---|---| or +---+---+
    if (/^\|?[\s-:|+]+$/.test(rawLine)) continue;

    // Skip markdown headers e.g. "# 🔴 Down Down" or "### Summary"
    if (/^#+/i.test(rawLine)) {
      continue;
    }

    // Skip PRTG web interface noise lines
    if (PRTG_NOISE_LINE.test(rawLine) || IS_ERROR_MSG.test(rawLine) || IS_DOWNTIME_LINE.test(rawLine)) {
      continue;
    }

    const isPipeTable = rawLine.includes('|');
    const isTabTable = rawLine.includes('\t');

    if (isPipeTable || isTabTable) {
      const rawCols = isPipeTable
        ? rawLine.split('|').map((c) => c.trim()).filter((_, idx, arr) => {
            if (idx === 0 && rawLine.startsWith('|')) return false;
            if (idx === arr.length - 1 && rawLine.endsWith('|')) return false;
            return true;
          })
        : rawLine.split('\t').map((c) => c.trim());

      const cleanCols = rawCols.map((c) => stripMarkdownLinks(c).trim().toLowerCase());
      const hasSensorCol = cleanCols.some((c) => /^(sensor|sensors|sensor name|sensor type)$/i.test(c));
      const hasDeviceCol = cleanCols.some((c) => /^(device|group|device name|probe)$/i.test(c));
      const hasStatusCol = cleanCols.some((c) => /^(status|state|alarm state)$/i.test(c));
      const hasDowntimeCol = cleanCols.some((c) => /^(downtime|duration|down since)$/i.test(c));

      // Header row detection
      if ((hasSensorCol && (hasDeviceCol || hasStatusCol)) || (hasDowntimeCol && hasDeviceCol)) {
        headerMap = {};
        for (let i = 0; i < cleanCols.length; i++) {
          const colName = cleanCols[i];
          if (/downtime|duration/i.test(colName)) headerMap.downtimeIdx = i;
          else if (/device|group|host|probe/i.test(colName)) headerMap.deviceIdx = i;
          else if (/sensor/i.test(colName)) headerMap.sensorIdx = i;
          else if (/value|reading/i.test(colName)) headerMap.valueIdx = i;
          else if (/status|state/i.test(colName)) headerMap.statusIdx = i;
          else if (/message|error/i.test(colName)) headerMap.messageIdx = i;
        }
        continue;
      }

      if (cleanCols.every((c) => /^(device|sensor|status|value|downtime|message|priority)$/i.test(c))) {
        continue;
      }

      let statusCol: SensorStatus | null = null;
      let downtimeStr = '';
      let valueStr = '';
      let deviceStr = '';
      let sensorStr = '';
      let ipStr = extractIp(rawLine) || '';

      const remainingCols: { index: number; text: string }[] = [];
      for (let i = 0; i < rawCols.length; i++) {
        const text = rawCols[i];
        if (!text) continue;

        const st = detectStatus(text);
        if (st && !statusCol) {
          statusCol = st;
          continue;
        }

        if (isDowntimeDuration(text) && !downtimeStr) {
          downtimeStr = text;
          continue;
        }

        if (isSensorValue(text) && !valueStr) {
          valueStr = text;
          continue;
        }

        const colIp = extractIp(text);
        if (colIp && !ipStr) {
          ipStr = colIp;
        }

        remainingCols.push({ index: i, text });
      }

      if (headerMap) {
        if (headerMap.deviceIdx !== undefined && rawCols[headerMap.deviceIdx] && !isSensorValue(rawCols[headerMap.deviceIdx]) && !detectStatus(rawCols[headerMap.deviceIdx])) {
          deviceStr = rawCols[headerMap.deviceIdx];
        }
        if (headerMap.sensorIdx !== undefined && rawCols[headerMap.sensorIdx] && !detectStatus(rawCols[headerMap.sensorIdx])) {
          sensorStr = rawCols[headerMap.sensorIdx];
        }
        if (headerMap.valueIdx !== undefined && rawCols[headerMap.valueIdx] && isSensorValue(rawCols[headerMap.valueIdx])) {
          valueStr = rawCols[headerMap.valueIdx];
        }
        if (headerMap.statusIdx !== undefined && rawCols[headerMap.statusIdx] && detectStatus(rawCols[headerMap.statusIdx])) {
          statusCol = detectStatus(rawCols[headerMap.statusIdx]);
        }
      }

      for (const rem of remainingCols) {
        const t = rem.text;
        if (t === deviceStr || t === sensorStr || t === valueStr) continue;
        if (/^(device|sensor|status|value|downtime)$/i.test(t)) continue;

        if (extractIp(t) || t.includes('»') || t.includes('>') || /data center|fl-|server|switch|router|vm|dc/i.test(t)) {
          if (!deviceStr) {
            deviceStr = t;
            continue;
          }
        }
        if (/disk|drive|storage|memory|meminfo|ram|cpu|processor|ping|traffic|port|http|uptime/i.test(t)) {
          if (!sensorStr) {
            sensorStr = t;
            continue;
          }
        }
        if (!deviceStr && !isSensorValue(t) && !detectStatus(t)) {
          deviceStr = t;
        } else if (!sensorStr && !isSensorValue(t) && !detectStatus(t)) {
          sensorStr = t;
        }
      }

      if (!statusCol) {
        statusCol = detectStatus(rawLine) || 'Down';
      }

      const parsedDev = parseDeviceAndIp(deviceStr, ipStr);
      let finalIp = parsedDev.ip || ipStr || '';
      if (finalIp === '0.0.0.0') finalIp = '';
      let finalDevice = parsedDev.device;
      if (isSensorValue(finalDevice) || detectStatus(finalDevice) || /^(device|unknown-device|sensor)$/i.test(finalDevice)) {
        finalDevice = '';
      }

      let finalSensor = cleanSensorName(sensorStr);
      if (/^(sensor|sensors|unknown sensor|status|device|value|down|warning|up)$/i.test(finalSensor)) {
        finalSensor = '';
      }

      let finalValue = cleanValue(valueStr);
      const isDeviceOnly = (!!finalDevice || !!finalIp) && !finalValue && !finalSensor;
      const isValueOnly = !!finalValue && !finalDevice && !finalIp;

      if (!finalSensor) {
        if (finalValue) {
          finalSensor = inferSensorFromValue(finalValue).sensor;
        } else if (finalDevice || finalIp) {
          finalSensor = 'Ping';
        } else {
          finalSensor = 'Ping';
        }
      }

      if (!finalValue) {
        finalValue = statusCol === 'Down' ? 'Down' : 'Warning';
      }

      rawItems.push({
        lineIndex,
        rawLine,
        ip: finalIp,
        device: finalDevice,
        sensor: finalSensor,
        value: finalValue,
        status: statusCol,
        downtime: downtimeStr || undefined,
        isDeviceOnly,
        isValueOnly,
      });
      continue;
    }

    // Free-form line parser
    // Handles:
    // "192.168.104.1 - UK - Sensor: 0%"
    // "0.0.0.0 - 13 Mbit/s - Down: **0%**"
    // "172.21.3.143 - FL-API-1 - Memory: 8% [Down]"
    // "192.168.104.1 - UK"
    // "13 Mbit/s Down"
    // "200 msec Warning"
    const hasExplicitStatus = /\b(down|warning|up|paused|acknowledged|alarm|unreachable|critical)\b/i.test(rawLine);
    const hasMeasurement = MEASUREMENT_ANYWHERE_REGEX.test(rawLine);
    const hasKnownSensor = /disk|drive|storage|memory|meminfo|ram|cpu|processor|ping|traffic|port|http|uptime|snmp/i.test(rawLine);
    let lineIp = extractIp(rawLine) || '';
    if (lineIp === '0.0.0.0' || lineIp === '0') lineIp = '';

    // If line has NO IP, NO measurement unit, NO explicit status word, and NO known sensor keyword, it is noise!
    if (!lineIp && !hasExplicitStatus && !hasMeasurement && !hasKnownSensor) {
      continue;
    }

    const status = detectStatus(rawLine) || 'Down';

    let cleanLine = rawLine.replace(/[*_]/g, '').replace(/\b0\.0\.0\.0\b/g, '').trim();
    if (lineIp) cleanLine = cleanLine.replace(lineIp, '').trim();

    const colonIdx = cleanLine.lastIndexOf(':');
    const afterColon = colonIdx !== -1 ? cleanLine.slice(colonIdx + 1).trim() : '';
    let beforeColon = colonIdx !== -1 ? cleanLine.slice(0, colonIdx).trim() : cleanLine;

    const matchAfter = afterColon.match(MEASUREMENT_ANYWHERE_REGEX);
    const matchBefore = beforeColon.match(MEASUREMENT_ANYWHERE_REGEX);

    let valueStr = '';
    if (matchBefore && (!matchAfter || matchAfter[0].startsWith('0%') || matchAfter[0] === '0')) {
      valueStr = matchBefore[0];
      beforeColon = beforeColon.replace(valueStr, '');
    } else if (matchAfter && !matchAfter[0].startsWith('0%')) {
      valueStr = matchAfter[0];
    } else if (matchBefore) {
      valueStr = matchBefore[0];
      beforeColon = beforeColon.replace(valueStr, '');
    } else if (matchAfter) {
      valueStr = matchAfter[0];
    }

    beforeColon = beforeColon
      .replace(new RegExp(`\\b${status}\\b`, 'gi'), '')
      .replace(/\b(sensor|sensors|unknown|unknown sensor)\b/gi, '')
      .replace(/^[-–—:\s()]+|[-–—:\s()]+$/g, '')
      .trim();

    const parts = beforeColon.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
    let deviceStr = '';
    let sensorStr = '';

    if (parts.length >= 2) {
      deviceStr = parts[0];
      sensorStr = parts.slice(1).join(' - ');
    } else if (parts.length === 1) {
      if (/disk|drive|storage|memory|meminfo|ram|cpu|processor|ping|traffic|port/i.test(parts[0])) {
        sensorStr = parts[0];
      } else {
        deviceStr = parts[0];
      }
    }

    if (MEASUREMENT_ANYWHERE_REGEX.test(deviceStr) || /^(down|warning|up|sensor|sensors|status|device)$/i.test(deviceStr)) {
      if (!valueStr && MEASUREMENT_ANYWHERE_REGEX.test(deviceStr)) {
        valueStr = deviceStr;
      }
      deviceStr = '';
    }

    if (!sensorStr || /^(sensor|sensors|unknown|unknown sensor|down|warning|up|status|device)$/i.test(sensorStr)) {
      if (valueStr && valueStr !== '0%') {
        sensorStr = inferSensorFromValue(valueStr).sensor;
      } else if (deviceStr || lineIp) {
        sensorStr = 'Ping';
      } else {
        sensorStr = 'Ping';
      }
    }

    if (!valueStr || (valueStr === '0%' && sensorStr === 'Ping')) {
      valueStr = status === 'Down' ? 'Down' : 'Warning';
    }

    valueStr = cleanValue(valueStr);

    const isDeviceOnly = Boolean((deviceStr || lineIp) && (valueStr === 'Down' || valueStr === 'Warning') && sensorStr === 'Ping');
    const isValueOnly = Boolean(valueStr && valueStr !== 'Down' && valueStr !== 'Warning' && !deviceStr && !lineIp);

    rawItems.push({
      lineIndex,
      rawLine,
      ip: lineIp,
      device: deviceStr,
      sensor: sensorStr,
      value: valueStr,
      status,
      isDeviceOnly,
      isValueOnly,
    });
  }

  // Second pass: Pair alternating lines if lone device is immediately followed by lone value with matching status
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const nextItem = rawItems[i + 1];

    const canPair =
      nextItem &&
      item.isDeviceOnly &&
      nextItem.isValueOnly &&
      item.status === nextItem.status &&
      (!rawItems[i - 1] || !rawItems[i - 1].isDeviceOnly) && // not in the middle of a device block
      (!rawItems[i + 2] || !rawItems[i + 2].isValueOnly); // not in the middle of a value block

    if (canPair) {
      const fusedSensor =
        nextItem.sensor && nextItem.sensor !== 'General' && nextItem.sensor !== 'Ping'
          ? nextItem.sensor
          : inferSensorFromValue(nextItem.value).sensor;
      const sensorGroup = normalizeSensorGroup(fusedSensor, nextItem.value, nextItem.status);

      alarms.push({
        id: `alarm-${item.lineIndex}-${item.ip || 'no-ip'}-${fusedSensor}`,
        originalIndex: item.lineIndex,
        raw: `${item.rawLine} | ${nextItem.rawLine}`,
        ip: item.ip,
        device: item.device,
        sensor: fusedSensor,
        sensorGroup,
        value: nextItem.value,
        status: nextItem.status,
        statusEmoji: STATUS_META[nextItem.status].emoji,
        downtime: nextItem.downtime || item.downtime,
      });

      i++; // skip nextItem since it's merged
      continue;
    }

    // Normal item
    const sensorGroup = normalizeSensorGroup(item.sensor, item.value, item.status);
    alarms.push({
      id: `alarm-${item.lineIndex}-${item.ip || 'no-ip'}-${item.sensor}`,
      originalIndex: item.lineIndex,
      raw: item.rawLine,
      ip: item.ip,
      device: item.device,
      sensor: item.sensor,
      sensorGroup,
      value: item.value,
      status: item.status,
      statusEmoji: STATUS_META[item.status].emoji,
      downtime: item.downtime,
    });
  }

  return alarms;
}

/**
 * Deduplicates parsed alarms by IP + Device + Sensor
 */
export function deduplicateAlarms(alarms: ParsedAlarm[]): ParsedAlarm[] {
  const seen = new Set<string>();
  const unique: ParsedAlarm[] = [];

  for (const item of alarms) {
    const hasIdentifier = Boolean(item.ip && item.ip !== '0.0.0.0') || Boolean(item.device && item.device !== 'Unknown-Device');
    const key = hasIdentifier
      ? `${item.ip.trim()}__${item.device.trim().toLowerCase()}__${item.sensor.trim().toLowerCase()}`
      : `${item.sensor.trim().toLowerCase()}__${item.value.trim().toLowerCase()}__${item.status}__${item.originalIndex}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

/**
 * Groups and sorts alarms by Status Priority, then Sensor Group, then selected sort order
 */
export function groupAndSortAlarms(alarms: ParsedAlarm[], options: ParseOptions = {}): GroupedAlarms[] {
  const items = options.removeDuplicates !== false ? deduplicateAlarms(alarms) : alarms;

  // Group by "status__sensorGroup"
  const map = new Map<string, ParsedAlarm[]>();

  for (const alarm of items) {
    const key = `${alarm.status}__${alarm.sensorGroup}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(alarm);
  }

  const grouped: GroupedAlarms[] = [];

  map.forEach((groupItems, key) => {
    const [statusStr, sensorGroup] = key.split('__');
    const status = statusStr as SensorStatus;
    const emoji = STATUS_META[status]?.emoji || '🔴';

    // Sort items within group based on options.sortBy
    groupItems.sort((a, b) => {
      if (options.sortBy === 'ip') {
        return compareIps(a.ip, b.ip);
      }
      if (options.sortBy === 'device') {
        return a.device.localeCompare(b.device);
      }
      if (options.sortBy === 'value') {
        return a.value.localeCompare(b.value, undefined, { numeric: true });
      }
      // 'original': preserve order from the input
      return a.originalIndex - b.originalIndex;
    });

    grouped.push({
      key,
      status,
      statusEmoji: emoji,
      sensorGroup,
      items: groupItems,
    });
  });

  // Sort groups by status priority, then sensorGroup name
  grouped.sort((a, b) => {
    const pA = STATUS_META[a.status]?.priority || 99;
    const pB = STATUS_META[b.status]?.priority || 99;
    if (pA !== pB) return pA - pB;
    return a.sensorGroup.localeCompare(b.sensorGroup);
  });

  return grouped;
}

/**
 * Formats grouped alarms into Telegram markdown string based on chosen template
 */
export function formatTelegramReport(grouped: GroupedAlarms[], options: ParseOptions = {}): string {
  if (grouped.length === 0) return '';

  const template = options.template || 'grouped-standard';
  const bold = options.boldValues !== false;
  const includeIp = options.includeIp !== false;
  const includeDowntime = Boolean(options.includeDowntime);
  const emptyLines = options.emptyLinesBetweenItems !== false;
  const itemSeparator = emptyLines ? '\n\n' : '\n';
  const headerPrefix = options.customHeaderPrefix ?? '# ';

  // Helper to format item value and suffix
  const getFormattedValue = (item: ParsedAlarm, useBold = bold): string => {
    let val = useBold ? `**${item.value}**` : item.value;
    if (includeDowntime && item.downtime) {
      val += ` (⏱ ${item.downtime})`;
    }
    return val;
  };

  // Helper to check valid IP and Device
  const checkDev = (item: ParsedAlarm) => {
    const hasIp = includeIp && item.ip && item.ip !== '0.0.0.0' && item.ip !== '0';
    const hasDevice =
      item.device &&
      item.device !== 'Unknown-Device' &&
      item.device !== 'Device' &&
      item.device.toLowerCase() !== item.sensor.toLowerCase();
    return { hasIp, hasDevice };
  };

  // 1. Template: NOC Incident Report (Ticket Format)
  if (template === 'noc-ticket') {
    const totalCount = grouped.reduce((sum, g) => sum + g.items.length, 0);
    const downCount = grouped.filter((g) => g.status === 'Down').reduce((s, g) => s + g.items.length, 0);
    const warnCount = grouped.filter((g) => g.status === 'Warning').reduce((s, g) => s + g.items.length, 0);

    const out: string[] = [
      '🚨 **PRTG NOC INCIDENT REPORT**',
      `📊 Total Alarms: **${totalCount}** (${downCount} Critical / ${warnCount} Warning)`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ];

    for (const group of grouped) {
      out.push(`${group.statusEmoji} **${group.status.toUpperCase()} ${group.sensorGroup.toUpperCase()}** (${group.items.length})`);
      for (const item of group.items) {
        const { hasIp, hasDevice } = checkDev(item);
        const devLabel = hasDevice ? `**${item.device}**` : '';
        const ipLabel = hasIp ? (devLabel ? `(${item.ip})` : `**${item.ip}**`) : '';
        const hostInfo = [devLabel, ipLabel].filter(Boolean).join(' ');
        const hostPart = hostInfo ? `${hostInfo} ➔ ` : '';
        out.push(`▫️ ${hostPart}${item.sensor}: ${getFormattedValue(item, true)}`);
      }
      out.push('');
    }
    out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return out.join('\n').trim();
  }

  // 2. Template: Clean Bullets (Flat list with status emoji, no big headers)
  if (template === 'clean-bullets') {
    const lines: string[] = [];
    for (const group of grouped) {
      for (const item of group.items) {
        const { hasIp, hasDevice } = checkDev(item);
        const host = hasIp && hasDevice ? `${item.ip} (${item.device})` : hasIp ? item.ip : hasDevice ? item.device : '';
        const hostPart = host ? `${host} - ` : '';
        lines.push(`${group.statusEmoji} ${hostPart}${item.sensor}: ${getFormattedValue(item)}`);
      }
    }
    return lines.join('\n');
  }

  // 5. Template: Compact / Dense (Single-line bullet items per group)
  if (template === 'grouped-compact') {
    const sections: string[] = [];
    for (const group of grouped) {
      let groupName = group.sensorGroup;
      if (!groupName || /^(sensor|sensors|down|warning|status)$/i.test(groupName)) {
        groupName = group.status === 'Down' ? 'Ping' : 'General';
      }
      const header = `${group.statusEmoji} *${group.status} ${groupName}:*`;
      const lines = group.items.map((item) => {
        const { hasIp, hasDevice } = checkDev(item);
        const host = hasIp && hasDevice ? `${item.ip} | ${item.device} | ` : hasIp ? `${item.ip} | ` : hasDevice ? `${item.device} | ` : '';
        return `• ${host}${item.sensor}: ${getFormattedValue(item, false)}`;
      });
      sections.push(`${header}\n${lines.join('\n')}`);
    }
    return sections.join('\n\n');
  }

  // 6. Template: Grouped Standard (Default)
  const sections: string[] = [];

  for (const group of grouped) {
    let groupName = group.sensorGroup;
    if (
      !groupName ||
      groupName.toLowerCase() === group.status.toLowerCase() ||
      groupName.toLowerCase() === 'sensor' ||
      groupName.toLowerCase() === 'sensors'
    ) {
      groupName = group.status === 'Down' ? 'Ping' : 'General';
    }

    const header = `${headerPrefix}${group.statusEmoji} ${group.status} ${groupName}`;

    const lines = group.items.map((item) => {
      const formattedVal = getFormattedValue(item);
      const { hasIp, hasDevice } = checkDev(item);

      if (hasIp && hasDevice) {
        return `${item.ip} - ${item.device} - ${item.sensor}: ${formattedVal}`;
      }
      if (hasIp && !hasDevice) {
        return `${item.ip} - ${item.sensor}: ${formattedVal}`;
      }
      if (!hasIp && hasDevice) {
        return `${item.device} - ${item.sensor}: ${formattedVal}`;
      }
      return `${item.sensor}: ${formattedVal}`;
    });

    const content = lines.join(itemSeparator);
    sections.push(`${header}\n\n${content}`);
  }

  return sections.join('\n\n');
}

/**
 * Default sample input containing the exact 16 real-world PRTG alarms from user prompt
 */
export const SAMPLE_PRTG_INPUT = `| Downtime | Device | Sensor | Last Value | Status |
| 1 h 20 m | [Data Center » FL-DC » [172.21.3.143 FL-API-1](https://prtg.corp.net/device.htm?id=101)] | [Memory](https://prtg.corp.net/sensor.htm?id=201) | 8 % | Down |
| 2 h 15 m | [Data Center » FL-DC » [172.21.8.159 FL-API-3](https://prtg.corp.net/device.htm?id=102)] | [Memory](https://prtg.corp.net/sensor.htm?id=202) | 7 % | Down |
| 45 m | [Data Center » FL-DC » [172.22.3.35 Front FL5](https://prtg.corp.net/device.htm?id=103)] | [Meminfo](https://prtg.corp.net/sensor.htm?id=203) | 4 % | Down |
| 10 m | [Data Center » Servers » [172.22.3.212 Parto-2](https://prtg.corp.net/device.htm?id=104)] | [CPU](https://prtg.corp.net/sensor.htm?id=204) | 1 % | Warning |
| 3 h 10 m | [Data Center » Storage » [172.22.3.96 ELK FL](https://prtg.corp.net/device.htm?id=105)] | [Disk](https://prtg.corp.net/sensor.htm?id=205) | 17 % | Warning |
| 1 d 2 h | [Data Center » Build » [172.25.3.164 Builder-HC-API](https://prtg.corp.net/device.htm?id=106)] | [Disk C](https://prtg.corp.net/sensor.htm?id=206) | 10 % | Warning |
| 5 h 30 m | [Data Center » Web » [172.21.3.131 IIS1](https://prtg.corp.net/device.htm?id=107)] | [Disk E](https://prtg.corp.net/sensor.htm?id=207) | 14 % | Warning |
| 12 m | [Data Center » Web » [172.22.3.49 API-FL-Other](https://prtg.corp.net/device.htm?id=108)] | [Disk D](https://prtg.corp.net/sensor.htm?id=208) | 12 % | Warning |
| 5 h 30 m | [Data Center » Web » [172.21.8.132 IIS2](https://prtg.corp.net/device.htm?id=109)] | [Disk E](https://prtg.corp.net/sensor.htm?id=209) | 14 % | Warning |
| 4 h 10 m | [Data Center » Web » [172.22.3.201 IIS-1](https://prtg.corp.net/device.htm?id=110)] | [Disk E](https://prtg.corp.net/sensor.htm?id=210) | 25 % | Warning |
| 6 h 00 m | [Data Center » Parto » [172.25.3.133 Parto-1](https://prtg.corp.net/device.htm?id=111)] | [Disk E](https://prtg.corp.net/sensor.htm?id=211) | 21 % | Warning |
| 6 h 00 m | [Data Center » Parto » [172.25.3.134 Parto-2](https://prtg.corp.net/device.htm?id=112)] | [Disk E](https://prtg.corp.net/sensor.htm?id=212) | 25 % | Warning |
| 3 h 45 m | [Data Center » Parto » [172.25.3.143 Parto-Job](https://prtg.corp.net/device.htm?id=113)] | [Disk E](https://prtg.corp.net/sensor.htm?id=213) | 20 % | Warning |
| 1 h 50 m | [Data Center » API » [172.21.3.144 FL-API-2](https://prtg.corp.net/device.htm?id=114)] | [Memory](https://prtg.corp.net/sensor.htm?id=214) | 14 % | Warning |
| 2 d 1 h | [Data Center » VM » [172.25.2.11 ESXi-1](https://prtg.corp.net/device.htm?id=115)] | [Memory](https://prtg.corp.net/sensor.htm?id=215) | 6 % | Warning |
| 10 s | [Data Center » Redis » [172.21.3.77 Rds-Any-2](https://prtg.corp.net/device.htm?id=116)] | [Port 6379](https://prtg.corp.net/sensor.htm?id=216) | 79 msec | Up |`;
