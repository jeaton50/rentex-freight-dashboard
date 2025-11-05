import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import { toPng } from 'html-to-image';
import { db } from './firebase';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import PasswordLogin from './PasswordLogin';
import EnhancedAnalytics from './Analytics';
import './App.css';

// ============================================
// DEFAULTS (bootstrap Firestore config.)
// ============================================
const DEFAULT_COMPANIES = [
  'COWBOYS', 'CRANE', 'FLORIDA FREIGHT', 'KOL', 'PHOENIX FREIGHT',
  'NEVILLE', 'SPI', 'TAZ', 'UP&GO', 'YOPO', 'Logistify',
  'ALG', 'PC EXPRESS', 'EXOTIC RETAILERS', 'ON Spot (neville)',
];

const DEFAULT_AGENTS = [
  'J.HOLLAND', 'M.KAIGLER', 'S.MCDEVITT', 'D.MERCHUT', 'P.VANDENBRINK',
  'J.SCALERA', 'D.BATTISTA', 'A.SUFKA', 'B.DELLAGIOVANNA', 'S.CLARK',
  'E.LOWERY', 'S.GRAVES', 'M.STONE', 'A.MACCANICO',
];

const DEFAULT_LOCATIONS = [
  'Rentex-Anaheim',
  'Rentex-Boston',
  'Rentex Chicago',
  'Rentex Ft. Lauderdale',
  'Rentex Las Vegas',
  'Rentex-Nashville',
  'Rentex NY/NJ',
  'Rentex Orlando',
  'Rentex Philadelphia',
  'Rentex Phoenix',
  'Rentex San Francisco',
  'Rentex Washington DC',
];

const DEFAULT_CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
  'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
  'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte',
  'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Washington DC',
  'Boston', 'El Paso', 'Nashville', 'Detroit', 'Oklahoma City',
  'Portland', 'Las Vegas', 'Memphis', 'Louisville', 'Baltimore',
  'Milwaukee', 'Albuquerque', 'Tucson', 'Fresno', 'Sacramento',
  'Kansas City', 'Mesa', 'Atlanta', 'Omaha', 'Colorado Springs',
  'Raleigh', 'Miami', 'Long Beach', 'Virginia Beach', 'Oakland',
  'Minneapolis', 'Tulsa', 'Tampa', 'Arlington', 'New Orleans'
];

// 2-letter U.S. states/territories for autocomplete; editable via Bulk Add too.
const DEFAULT_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD',
  'ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','PR','RI','SC',
  'SD','TN','TX','UT','VA','VI','VT','WA','WI','WV','WY'
];

const SHIP_METHODS = ['Round Trip', 'One Way', 'Daily rate','SWA Last Mile - Round Trip','FAIR Last Mile - Round Trip','SWA Last Mile - One Way','FAIR Last Mile - One Way',];
const VEHICLE_TYPES = ['Trailer', 'Sprinter Van', 'Box Truck'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_WITH_YTD = [...MONTHS, 'YTD'];

const YEAR_OPTIONS = [2025, 2026, 2027, 2028, 2029, 2030];
const thisYear = new Date().getFullYear();
const DEFAULT_YEAR = YEAR_OPTIONS.includes(thisYear) ? thisYear : 2025;

const monthDocRef = (year, month) => doc(db, 'freight-data', String(year), 'months', month);
const currentMonthName = () => MONTHS[new Date().getMonth()];

function autosizeColumns(sheet, { min = 8, max = 42, buffer = 2 } = {}) {
  sheet.columns.forEach((col) => {
    let maxLen = 0;

    const headerText = col.header != null ? String(col.header) : '';
    maxLen = Math.max(maxLen, headerText.length);

    col.eachCell({ includeEmpty: true }, (cell) => {
      let v = cell.value;
      if (v == null) return;

      if (typeof v === 'object') {
        if (v.richText && Array.isArray(v.richText)) {
          v = v.richText.map(rt => rt.text).join('');
        } else if (v.text) {
          v = v.text;
        } else if (v.result != null) {
          v = v.result;
        } else if (v instanceof Date) {
          v = '00/00/0000';
        } else if (v.hyperlink) {
          v = v.text || v.hyperlink;
        }
      }

      const str = String(v);
      maxLen = Math.max(maxLen, str.length);
    });

    const isNumericCol = col.numFmt && /[#0]/.test(col.numFmt);
    if (isNumericCol) maxLen += 2;

    const width = Math.min(Math.max(maxLen + buffer, min), max);
    col.width = width;
  });
}

const excelSerialToDateUTC = (serial) => {
  const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
  const ms = Math.round(Number(serial) * 86400000);
  return new Date(EXCEL_EPOCH_UTC + ms);
};

const toISODateUTC = (d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [selectedYear, setSelectedYear] = useState(DEFAULT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState('January');
  const isYTD = selectedMonth === 'YTD';
  const [editTargetMonth, setEditTargetMonth] = useState(currentMonthName());

  const [companies, setCompanies] = useState(DEFAULT_COMPANIES);
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [agents, setAgents] = useState(DEFAULT_AGENTS);
  const [cities, setCities] = useState(DEFAULT_CITIES);
  const [states, setStates] = useState(DEFAULT_STATES);
  const [clients, setClients] = useState([]);
  const [bulkAddModal, setBulkAddModal] = useState({ open: false, type: '', items: '' });
  const [singleAddModal, setSingleAddModal] = useState({ open: false, type: '', value: '' });
  const [shipments, setShipments] = useState([]);

  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState([]);
  const inputRef = useRef(null);
  const [dropdownRect, setDropdownRect] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [showQuickAdds, setShowQuickAdds] = useState(false);
  const fileInputRef = useRef(null);
  const monthFileInputRef = useRef(null); // NEW: For importing single month
  const jsonFileInputRef = useRef(null);
  const jsonClientsInputRef = useRef(null);

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [statusEnabled, setStatusEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  const [unsavedRows, setUnsavedRows] = useState(new Set()); // Track row indices that need saving

  const costPerCompanyRef = useRef(null);
  const clientStatsRef = useRef(null);
  const agentStatsRef = useRef(null);
  const shipmentCountRef = useRef(null);
  const revenueDistRef = useRef(null);
  const cityStatsRef = useRef(null);
  const stateStatsRef = useRef(null);

  // Authentication check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
        sessionStorage.setItem('isAuthenticated', 'true');
      } else {
        setIsAuthenticated(false);
        sessionStorage.removeItem('isAuthenticated');
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = (success) => {
    setIsAuthenticated(success);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      sessionStorage.removeItem('isAuthenticated');
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
      alert('Failed to logout. Please try again.');
    }
  };

  // Firebase config listener
  useEffect(() => {
    const cfgRef = doc(db, 'freight-config', 'global');
    const unsub = onSnapshot(cfgRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.companies) setCompanies(data.companies);
        if (data.locations) setLocations(data.locations);
        if (data.agents) setAgents(data.agents);
        if (data.cities) setCities(data.cities);
        if (data.states) setStates(data.states);
        if (data.clients) setClients(data.clients);
      }
    });
    return () => unsub();
  }, []);

  // Load shipments for selected year/month
  useEffect(() => {
    if (isYTD) {
      const loadYtd = async () => {
        const allShipments = [];
        for (const m of MONTHS) {
          const snap = await getDoc(monthDocRef(selectedYear, m));
          if (snap.exists()) {
            const data = snap.data();
            if (data.shipments) allShipments.push(...data.shipments);
          }
        }
        setShipments(allShipments);
        setUnsavedRows(new Set()); // Clear unsaved tracking for YTD
      };
      loadYtd();
    } else {
      const unsub = onSnapshot(monthDocRef(selectedYear, selectedMonth), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setShipments(data.shipments || []);
        } else {
          setShipments([]);
        }
        setUnsavedRows(new Set()); // Clear unsaved tracking when loading new data
      });
      return () => unsub();
    }
  }, [selectedYear, selectedMonth, isYTD]);

  // No auto-save - users save individual rows manually

  // Manual save function
  const handleManualSave = async () => {
    if (isYTD) {
      alert('Cannot manually save in YTD view. Please switch to a specific month.');
      return;
    }
    
    setSaveStatus('saving');
    try {
      await setDoc(monthDocRef(selectedYear, selectedMonth), {
        shipments,
        lastModified: new Date().toISOString(),
        month: selectedMonth,
        year: selectedYear,
      });
      console.log('✅ Manual save:', selectedMonth, selectedYear, '|', shipments.length, 'rows');
      setSaveStatus('saved');
      setUnsavedRows(new Set()); // Clear all unsaved markers
      alert('✅ Data saved successfully!');
    } catch (err) {
      console.error('❌ Manual save failed:', err);
      setSaveStatus('error');
      if (err.code === 'resource-exhausted') {
        alert('⚠️ Firebase quota exceeded. Please try again later or upgrade your Firebase plan.');
      } else {
        alert('❌ Save failed: ' + err.message);
      }
    }
  };

  // Save individual row
  const handleSaveRow = async (rowIndex) => {
    if (isYTD) return;
    
    try {
      await setDoc(monthDocRef(selectedYear, selectedMonth), {
        shipments,
        lastModified: new Date().toISOString(),
        month: selectedMonth,
        year: selectedYear,
      });
      console.log('✅ Row saved:', rowIndex, selectedMonth, selectedYear);
      
      // Remove this row from unsaved set
      setUnsavedRows(prev => {
        const newSet = new Set(prev);
        newSet.delete(rowIndex);
        return newSet;
      });
      
      // Show brief success indicator
      setSaveStatus('saved');
    } catch (err) {
      console.error('❌ Row save failed:', err);
      setSaveStatus('error');
      if (err.code === 'resource-exhausted') {
        alert('⚠️ Firebase quota exceeded. Please try again later.');
      } else {
        alert('❌ Save failed: ' + err.message);
      }
    }
  };

  // Save immediately when switching months/years to prevent data loss
  const previousMonthRef = useRef(selectedMonth);
  const previousYearRef = useRef(selectedYear);
  const previousShipmentsRef = useRef(shipments);

  useEffect(() => {
    const monthChanged = previousMonthRef.current !== selectedMonth;
    const yearChanged = previousYearRef.current !== selectedYear;
    
    if ((monthChanged || yearChanged) && !isYTD && previousShipmentsRef.current.length > 0) {
      // Check if there are unsaved changes
      if (unsavedRows.size > 0) {
        const confirmSwitch = window.confirm(
          `You have ${unsavedRows.size} unsaved row(s). Do you want to save before switching to ${selectedMonth} ${selectedYear}?`
        );
        
        if (confirmSwitch) {
          // Save before switching
          const savePrevious = async () => {
            try {
              await setDoc(monthDocRef(previousYearRef.current, previousMonthRef.current), {
                shipments: previousShipmentsRef.current,
                lastModified: new Date().toISOString(),
                month: previousMonthRef.current,
                year: previousYearRef.current,
              });
              console.log('✅ Saved before switching:', previousMonthRef.current, previousYearRef.current);
              setUnsavedRows(new Set()); // Clear unsaved after saving
            } catch (err) {
              console.error('❌ Save before switch failed:', err);
              if (err.code === 'resource-exhausted') {
                alert('⚠️ Quota exceeded - changes may not be saved');
              }
            }
          };
          savePrevious();
        }
      }
    }

    previousMonthRef.current = selectedMonth;
    previousYearRef.current = selectedYear;
    previousShipmentsRef.current = shipments;
  }, [selectedMonth, selectedYear, shipments, isYTD, unsavedRows]);

  const handleMonthChange = (newMonth) => {
    setEditingCell(null);
    setSelectedMonth(newMonth);
    setUnsavedRows(new Set()); // Clear unsaved tracking when switching months
  };

  const handleAddRow = async () => {
    const targetMonth = isYTD ? editTargetMonth : selectedMonth;
    const newRow = {
      refNum: '',
      client: '',
      shipDate: '',
      returnDate: '',
      location: '',
      returnLocation: '',
      city: '',
      state: '',
      company: '',
      shipMethod: '',
      vehicleType: '',
      shippingCharge: 0,
      po: '',
      agent: '',
    };
    if (isYTD) {
      const snap = await getDoc(monthDocRef(selectedYear, targetMonth));
      const existing = snap.exists() ? (snap.data().shipments || []) : [];
      const updated = [newRow, ...existing];
      await setDoc(monthDocRef(selectedYear, targetMonth), {
        shipments: updated,
        lastModified: new Date().toISOString(),
        month: targetMonth,
        year: selectedYear,
      });
      alert(`Row added to ${targetMonth} ${selectedYear}. Switch to that month to edit.`);
    } else {
      const newShipments = [newRow, ...shipments];
      setShipments(newShipments);
      // Mark row 0 (the new row) as unsaved
      setUnsavedRows(prev => new Set(prev).add(0));
    }
  };

  const handleDeleteRow = async (rowIndex) => {
    if (!window.confirm('Delete this row?')) return;
    if (isYTD) {
      alert('Cannot delete from YTD view. Switch to a specific month.');
      return;
    }
    const updated = shipments.filter((_, i) => i !== rowIndex);
    setShipments(updated);
    
    // Remove from unsaved set and adjust indices of rows after this one
    setUnsavedRows(prev => {
      const newSet = new Set();
      prev.forEach(idx => {
        if (idx < rowIndex) {
          newSet.add(idx); // Rows before deleted row keep same index
        } else if (idx > rowIndex) {
          newSet.add(idx - 1); // Rows after deleted row shift down by 1
        }
        // If idx === rowIndex, we skip it (it's being deleted)
      });
      return newSet;
    });
  };

  const startEditCell = (rowIndex, field, currentValue) => {
    if (isYTD) return;
    setEditingCell({ rowIndex, field });
    setEditValue(currentValue ?? '');
    setShowDropdown(false);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownRect({ left: rect.left, top: rect.bottom, width: rect.width });
      }
    }, 0);
  };

  const handleCellChange = (e) => {
    const val = e.target.value;
    setEditValue(val);
    const field = editingCell.field;
    if (
      field === 'company' ||
      field === 'agent' ||
      field === 'location' ||
      field === 'returnLocation' ||
      field === 'city' ||
      field === 'state' ||
      field === 'client' ||
      field === 'shipMethod' ||
      field === 'vehicleType'
    ) {
      let opts = [];
      if (field === 'company') opts = companies;
      else if (field === 'agent') opts = agents;
      else if (field === 'location' || field === 'returnLocation') opts = locations;
      else if (field === 'city') opts = cities;
      else if (field === 'state') opts = states;
      else if (field === 'client') opts = clients;
      else if (field === 'shipMethod') opts = SHIP_METHODS;
      else if (field === 'vehicleType') opts = VEHICLE_TYPES;

      if (val.trim() === '') {
        setFilteredOptions(opts);
        setShowDropdown(true);
      } else {
        const lower = val.toLowerCase();
        const filtered = opts.filter(item =>
          String(item).toLowerCase().includes(lower)
        );
        setFilteredOptions(filtered);
        setShowDropdown(filtered.length > 0);
      }
    } else {
      setShowDropdown(false);
    }
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;
    const updatedShipments = [...shipments];
    const isNumeric = field === 'shippingCharge';
    let finalValue = editValue;

    if (isNumeric) {
      const num = parseFloat(editValue);
      finalValue = isNaN(num) ? 0 : num;
    } else if (field === 'company') {
      finalValue = editValue.toUpperCase();
    } else if (field === 'agent') {
      let candidate = editValue.toUpperCase();
      if (!candidate.includes('.')) {
        const parts = candidate.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          const firstInitial = parts[0][0];
          const last = parts.slice(1).join('').replace(/[^A-Z]/g, '');
          candidate = `${firstInitial}.${last}`;
        }
      }
      finalValue = candidate;
    } else if (field === 'state') {
      finalValue = editValue.toUpperCase().slice(0, 2);
    }

    updatedShipments[rowIndex][field] = finalValue;
    setShipments(updatedShipments);
    
    // Mark this row as unsaved
    setUnsavedRows(prev => new Set(prev).add(rowIndex));
    
    setEditingCell(null);
    setShowDropdown(false);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setShowDropdown(false);
  };

  const selectOption = (option) => {
    setEditValue(option);
    setShowDropdown(false);
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const handleSingleAdd = async () => {
    const { type, value } = singleAddModal;
    if (!value || !value.trim()) {
      alert('Please enter a value');
      return;
    }

    let currentList, fieldName, processor;

    switch (type) {
      case 'company':
        currentList = companies;
        fieldName = 'companies';
        processor = (val) => val.toUpperCase();
        break;
      case 'location':
        currentList = locations;
        fieldName = 'locations';
        processor = (val) => val;
        break;
      case 'agent':
        currentList = agents;
        fieldName = 'agents';
        processor = (val) => {
          let candidate = val.toUpperCase();
          if (!candidate.includes('.')) {
            const parts = candidate.split(/\s+/).filter(Boolean);
            if (parts.length >= 2) {
              const firstInitial = parts[0][0];
              const last = parts.slice(1).join('').replace(/[^A-Z]/g, '');
              candidate = `${firstInitial}.${last}`;
            }
          }
          return candidate;
        };
        break;
      case 'city':
        currentList = cities;
        fieldName = 'cities';
        processor = (val) => val;
        break;
      case 'state':
        currentList = states;
        fieldName = 'states';
        processor = (val) => (val || '').toUpperCase().slice(0,2);
        break;
      case 'client':
        currentList = clients;
        fieldName = 'clients';
        processor = (val) => val;
        break;
      default:
        return;
    }

    const processed = processor(value.trim());
    const exists = currentList.some(item => 
      String(item).toLowerCase() === String(processed).toLowerCase()
    );

    if (exists) {
      alert(`"${processed}" already exists!`);
      return;
    }

    const updatedList = [...currentList, processed].sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
    );

    try {
      const cfgRef = doc(db, 'freight-config', 'global');
      await setDoc(cfgRef, { 
        [fieldName]: updatedList, 
        updatedAt: new Date().toISOString() 
      }, { merge: true });
      
      setSingleAddModal({ open: false, type: '', value: '' });
      alert(`✅ Added "${processed}" successfully!`);
    } catch (e) {
      console.error(`Failed to add ${type}:`, e);
      alert(`Failed to add ${type}. Check your permissions/rules.`);
    }
  };

  const handleBulkAdd = async () => {
    // This preserves spaces within entry names (e.g., "Oncue Staging")
    const lines = bulkAddModal.items
      .split(/[\n\r,]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      alert('Please enter at least one item (separate with commas or new lines)');
      return;
    }

    const type = bulkAddModal.type;
    let currentList, fieldName, processor;

    switch (type) {
      case 'company':
        currentList = companies;
        fieldName = 'companies';
        processor = (val) => val.toUpperCase();
        break;
      case 'location':
        currentList = locations;
        fieldName = 'locations';
        processor = (val) => val;
        break;
      case 'agent':
        currentList = agents;
        fieldName = 'agents';
        processor = (val) => {
          let candidate = val.toUpperCase();
          if (!candidate.includes('.')) {
            const parts = candidate.split(/\\s+/).filter(Boolean);
            if (parts.length >= 2) {
              const firstInitial = parts[0][0];
              const last = parts.slice(1).join('').replace(/[^A-Z]/g, '');
              candidate = `${firstInitial}.${last}`;
            }
          }
          return candidate;
        };
        break;
      case 'city':
        currentList = cities;
        fieldName = 'cities';
        processor = (val) => val;
        break;
      case 'state':
        currentList = states;
        fieldName = 'states';
        processor = (val) => (val || '').toUpperCase().slice(0,2);
        break;
      case 'client':
        currentList = clients;
        fieldName = 'clients';
        processor = (val) => val;
        break;
      default:
        return;
    }

    const newItems = [];
    const duplicates = [];
    
    lines.forEach(line => {
      const processed = processor(line);
      const exists = currentList.some(item => 
        String(item).toLowerCase() === String(processed).toLowerCase()
      );
      
      if (exists) {
        duplicates.push(processed);
      } else if (!newItems.some(item => String(item).toLowerCase() === String(processed).toLowerCase())) {
        newItems.push(processed);
      }
    });

    if (newItems.length === 0) {
      alert(`All items already exist!${duplicates.length > 0 ? '\\n\\nDuplicates: ' + duplicates.join(', ') : ''}`);
      return;
    }

    const updatedList = [...currentList, ...newItems].sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
    );

    try {
      const cfgRef = doc(db, 'freight-config', 'global');
      await setDoc(cfgRef, { 
        [fieldName]: updatedList, 
        updatedAt: new Date().toISOString() 
      }, { merge: true });
      
      setBulkAddModal({ open: false, type: '', items: '' });
      
      const message = `✅ Added ${newItems.length} ${type}(s) successfully!` +
        (duplicates.length > 0 ? `\\n\\n⚠️ Skipped ${duplicates.length} duplicate(s)` : '');
      alert(message);
    } catch (e) {
      console.error(`Failed to bulk add ${type}s:`, e);
      alert(`Failed to add ${type}s. Check your permissions/rules.`);
    }
  };

  const handleImportCitiesJSON = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // Reset input
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Support different JSON formats
      let cityList = [];
      
      if (Array.isArray(data)) {
        // Format 1: Simple array ["City1", "City2", ...]
        cityList = data.filter(item => typeof item === 'string' && item.trim());
      } else if (data.cities && Array.isArray(data.cities)) {
        // Format 2: Object with cities array { cities: ["City1", "City2", ...] }
        cityList = data.cities.filter(item => typeof item === 'string' && item.trim());
      } else if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        // Format 3: Array of objects [{ name: "City1", state: "CA" }, ...]
        cityList = data
          .filter(item => item.name)
          .map(item => item.name.trim());
      }

      if (cityList.length === 0) {
        alert('No valid cities found in JSON file.\\n\\nSupported formats:\\n1. ["City1", "City2"]\\n2. { "cities": ["City1", "City2"] }\\n3. [{ "name": "City1" }, { "name": "City2" }]');
        return;
      }

      // Remove duplicates and merge with existing
      const existingLower = cities.map(c => c.toLowerCase());
      const newCities = cityList.filter(
        city => !existingLower.includes(city.toLowerCase())
      );

      if (newCities.length === 0) {
        alert(`All ${cityList.length} cities from the file already exist!`);
        return;
      }

      const confirm = window.confirm(
        `Found ${cityList.length} cities in file.\\n${newCities.length} are new.\\n\\nMerge with existing cities?`
      );

      if (!confirm) return;

      const updatedCities = [...cities, ...newCities].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );

      // Save to Firebase
      const cfgRef = doc(db, 'freight-config', 'global');
      await setDoc(cfgRef, {
        cities: updatedCities,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      alert(`✅ Successfully imported ${newCities.length} new cities!\\n\\nTotal cities: ${updatedCities.length}`);

    } catch (error) {
      console.error('JSON import failed:', error);
      if (error instanceof SyntaxError) {
        alert('❌ Invalid JSON file. Please check the file format.');
      } else {
        alert(`❌ Import failed: ${error.message}`);
      }
    }
  };

  const onClickImportCitiesJSON = () => jsonFileInputRef.current?.click();

  const handleImportClientsJSON = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // Reset input
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Support different JSON formats
      let clientList = [];
      
      if (Array.isArray(data)) {
        // Format 1: Simple array ["Client1", "Client2", ...]
        clientList = data.filter(item => typeof item === 'string' && item.trim());
      } else if (data.clients && Array.isArray(data.clients)) {
        // Format 2: Object with clients array { clients: ["Client1", "Client2", ...] }
        clientList = data.clients.filter(item => typeof item === 'string' && item.trim());
      } else if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        // Format 3: Array of objects [{ name: "Client1", contact: "..." }, ...]
        clientList = data
          .filter(item => item.name)
          .map(item => item.name.trim());
      }

      if (clientList.length === 0) {
        alert('No valid clients found in JSON file.\\n\\nSupported formats:\\n1. ["Client1", "Client2"]\\n2. { "clients": ["Client1", "Client2"] }\\n3. [{ "name": "Client1" }, { "name": "Client2" }]');
        return;
      }

      // Remove duplicates and merge with existing
      const existingLower = clients.map(c => c.toLowerCase());
      const newClients = clientList.filter(
        client => !existingLower.includes(client.toLowerCase())
      );

      if (newClients.length === 0) {
        alert(`All ${clientList.length} clients from the file already exist!`);
        return;
      }

      const confirm = window.confirm(
        `Found ${clientList.length} clients in file.\\n${newClients.length} are new.\\n\\nMerge with existing clients?`
      );

      if (!confirm) return;

      const updatedClients = [...clients, ...newClients].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );

      // Save to Firebase
      const cfgRef = doc(db, 'freight-config', 'global');
      await setDoc(cfgRef, {
        clients: updatedClients,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      alert(`✅ Successfully imported ${newClients.length} new clients!\\n\\nTotal clients: ${updatedClients.length}`);

    } catch (error) {
      console.error('JSON import failed:', error);
      if (error instanceof SyntaxError) {
        alert('❌ Invalid JSON file. Please check the file format.');
      } else {
        alert(`❌ Import failed: ${error.message}`);
      }
    }
  };

  const onClickImportClientsJSON = () => jsonClientsInputRef.current?.click();

  const excelColumns = [
    { header: 'Reference #', key: 'refNum' },
    { header: 'Client', key: 'client' },
    { header: 'Ship Date', key: 'shipDate' },
    { header: 'Return Date', key: 'returnDate' },
    { header: 'Location', key: 'location' },
    { header: 'Return Location', key: 'returnLocation' },
    { header: 'City', key: 'city' },
    { header: 'State', key: 'state' },
    { header: 'Company', key: 'company' },
    { header: 'Ship Method', key: 'shipMethod' },
    { header: 'Vehicle Type', key: 'vehicleType' },
    { header: 'Charges', key: 'shippingCharge' },
    { header: 'PO', key: 'po' },
    { header: 'Agent', key: 'agent' },
  ];

  const mapRowsForExcel = (rows) =>
    rows.map((s) => ({
      refNum: s.refNum ?? '',
      client: s.client ?? '',
      shipDate: s.shipDate ?? '',
      returnDate: s.returnDate ?? '',
      location: s.location ?? '',
      returnLocation: s.returnLocation ?? '',
      city: s.city ?? '',
      state: s.state ?? '',
      company: s.company ?? '',
      shipMethod: s.shipMethod ?? '',
      vehicleType: s.vehicleType ?? '',
      shippingCharge: Number(s.shippingCharge || 0),
      po: s.po ?? '',
      agent: s.agent ?? '',
    }));

  const buildDataSheetPretty = (wb, title, rows) => {
    const safeTitle = title.slice(0, 31);
    const sheet = wb.addWorksheet(safeTitle, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = excelColumns;
    sheet.getRow(1).font = { bold: true };
    rows.forEach((r) => sheet.addRow(r));
    sheet.getColumn('shippingCharge').numFmt = '$#,##0.00';
    autosizeColumns(sheet, { min: 10, max: 40, buffer: 2 });

    return sheet;
  };

  const buildAllRowsSheet = (wb, year, monthToRowsMap) => {
    const sheet = wb.addWorksheet('All Rows', { views: [{ state: 'frozen', ySplit: 1 }] });

    sheet.columns = [
      { header: 'Year', key: 'year' },
      { header: 'Month', key: 'month' },
      { header: 'Reference #', key: 'refNum' },
      { header: 'Client', key: 'client' },
      { header: 'Ship Date', key: 'shipDate' },
      { header: 'Return Date', key: 'returnDate' },
      { header: 'Location', key: 'location' },
      { header: 'Return Location', key: 'returnLocation' },
      { header: 'City', key: 'city' },
      { header: 'State', key: 'state' },
      { header: 'Company', key: 'company' },
      { header: 'Ship Method', key: 'shipMethod' },
      { header: 'Vehicle Type', key: 'vehicleType' },
      { header: 'Charges', key: 'shippingCharge' },
      { header: 'PO', key: 'po' },
      { header: 'Agent', key: 'agent' },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    MONTHS.forEach(m => {
      const rows = monthToRowsMap[m] || [];
      rows.forEach(r => {
        sheet.addRow({ year, month: m, ...r });
      });
    });

    sheet.getColumn('shippingCharge').numFmt = '$#,##0.00';
    autosizeColumns(sheet, { min: 10, max: 40, buffer: 2 });

    return sheet;
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const buildYtdMatrix = async () => {
    const byMonth = {};
    for (const m of MONTHS) {
      const snap = await getDoc(monthDocRef(selectedYear, m));
      byMonth[m] = snap.exists() ? (snap.data().shipments || []) : [];
    }

    const allCompanies = new Set();
    MONTHS.forEach((m) => {
      byMonth[m].forEach((s) => allCompanies.add(s.company || '(Unassigned)'));
    });

    const matrix = {};
    allCompanies.forEach((c) => {
      matrix[c] = {};
      MONTHS.forEach((m) => { matrix[c][m] = 0; });
    });

    MONTHS.forEach((m) => {
      byMonth[m].forEach((s) => {
        const name = s.company || '(Unassigned)';
        matrix[name][m] += Number(s.shippingCharge || 0);
      });
    });

    const rows = Array.from(allCompanies).map((c) => {
      const monthsVals = MONTHS.map((m) => matrix[c][m]);
      const total = monthsVals.reduce((a, b) => a + b, 0);
      return { company: c, monthsVals, total };
    }).sort((a, b) => b.total - a.total);

    const monthlyTotals = MONTHS.map((m, idx) =>
      rows.reduce((sum, r) => sum + r.monthsVals[idx], 0)
    );
    const grandTotal = monthlyTotals.reduce((a, b) => a + b, 0);

    return { rows, monthlyTotals, grandTotal };
  };

  const exportMonthExcel = async () => {
    const capture = async (node) =>
      node ? await toPng(node, { cacheBust: true, backgroundColor: 'white', pixelRatio: 2 }) : null;

    const statsWereHidden = !statusEnabled;
    if (statsWereHidden) {
      setStatusEnabled(true);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const [
  imgCostPerCompany,
  imgShipmentCount,
  imgRevenueDist,
  imgClientStats,
  imgAgentStats,
  imgCityStats,
  imgStateStats,
] = await Promise.all([
  capture(costPerCompanyRef.current),
  capture(shipmentCountRef.current),
  capture(revenueDistRef.current),
  capture(clientStatsRef.current),
  capture(agentStatsRef.current),
  capture(cityStatsRef.current),
  capture(stateStatsRef.current),
]);

if (statsWereHidden) {
  setStatusEnabled(false);
}

    const wb = new ExcelJS.Workbook();
    const rows = mapRowsForExcel(shipments);

    if (!isYTD) {
      buildDataSheetPretty(wb, `${selectedMonth} ${selectedYear}`, rows);
    } else {
      const { rows: ytdRows, monthlyTotals, grandTotal } = await buildYtdMatrix();
      const sheet = wb.addWorksheet('YTD Totals', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = [
        { header: 'Company', key: 'company' },
        ...MONTHS.map((m) => ({ header: m, key: m })),
        { header: 'Total', key: 'total' },
      ];
      sheet.getRow(1).font = { bold: true };

      ytdRows.forEach((row) => {
        const rowData = { company: row.company, total: row.total };
        MONTHS.forEach((m, idx) => {
          rowData[m] = row.monthsVals[idx];
        });
        sheet.addRow(rowData);
      });

      const totalsRowData = { company: 'TOTAL', total: grandTotal };
      MONTHS.forEach((m, idx) => {
        totalsRowData[m] = monthlyTotals[idx];
      });
      const totalsRow = sheet.addRow(totalsRowData);
      totalsRow.font = { bold: true };
      totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };

      MONTHS.forEach((m) => {
        sheet.getColumn(m).numFmt = '$#,##0.00';
      });
      sheet.getColumn('total').numFmt = '$#,##0.00';
      autosizeColumns(sheet, { min: 10, max: 40, buffer: 2 });
    }

    const addImageSheet = (img, title) => {
      if (!img) return;
      const s = wb.addWorksheet(title);
      const imgId = wb.addImage({ base64: img, extension: 'png' });
      s.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 800, height: 600 } });
      s.getColumn(1).width = 100;
      s.getRow(1).height = 450;
    };

    if (!isYTD && statusEnabled) {
      addImageSheet(imgCostPerCompany, 'Cost by Company');
      addImageSheet(imgShipmentCount, 'Shipment Count');
      addImageSheet(imgRevenueDist, 'Revenue Distribution');
      addImageSheet(imgClientStats, 'Client Stats');
      addImageSheet(imgAgentStats, 'Agent Stats');
      addImageSheet(imgCityStats, 'City Stats');
      addImageSheet(imgStateStats, 'State Stats');
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const filename = isYTD
      ? `Freight_YTD_${selectedYear}.xlsx`
      : `Freight_${selectedMonth}_${selectedYear}.xlsx`;
    downloadBlob(blob, filename);
  };

  const exportAllMonthsExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const monthToRowsMap = {};
    for (const m of MONTHS) {
      const snap = await getDoc(monthDocRef(selectedYear, m));
      monthToRowsMap[m] = snap.exists() ? mapRowsForExcel(snap.data().shipments || []) : [];
    }

    MONTHS.forEach((m) => {
      buildDataSheetPretty(wb, `${m} ${selectedYear}`, monthToRowsMap[m]);
    });

    buildAllRowsSheet(wb, selectedYear, monthToRowsMap);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, `Freight_All_Months_${selectedYear}.xlsx`);
  };

  const parseSheetToShipments = (sheet) => {
    const shipmentsOut = [];
    const headerRow = sheet.getRow(1);

    const idxToKey = {};
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const headerText = (cell.value || '').toString().toLowerCase().trim();
      if (headerText.includes('reference')) idxToKey[colNumber] = 'refNum';
      else if (headerText.includes('client')) idxToKey[colNumber] = 'client';
      else if (headerText.includes('ship date')) idxToKey[colNumber] = 'shipDate';
      else if (headerText.includes('return date')) idxToKey[colNumber] = 'returnDate';
      else if (headerText.includes('return location')) idxToKey[colNumber] = 'returnLocation';
      else if (headerText.includes('location')) idxToKey[colNumber] = 'location';
      else if (headerText.includes('city')) idxToKey[colNumber] = 'city';
      else if (headerText.includes('state')) idxToKey[colNumber] = 'state';
      else if (headerText.includes('company')) idxToKey[colNumber] = 'company';
      else if (headerText.includes('ship method')) idxToKey[colNumber] = 'shipMethod';
      else if (headerText.includes('vehicle')) idxToKey[colNumber] = 'vehicleType';
      else if (headerText.includes('charge')) idxToKey[colNumber] = 'shippingCharge';
      else if (headerText.includes('po')) idxToKey[colNumber] = 'po';
      else if (headerText.includes('agent')) idxToKey[colNumber] = 'agent';
    });

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const s = {
        refNum: '',
        client: '',
        shipDate: '',
        returnDate: '',
        location: '',
        returnLocation: '',
        city: '',
        state: '',
        company: '',
        shipMethod: '',
        vehicleType: '',
        shippingCharge: 0,
        po: '',
        agent: '',
      };

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const key = idxToKey[colNumber];
        if (!key) return;

        let val = cell.value;

        const setDateSafely = (v, field) => {
          if (v == null || v === '') return;
          if (v instanceof Date) {
            s[field] = toISODateUTC(v);
          } else if (typeof v === 'number') {
            const d = excelSerialToDateUTC(v);
            s[field] = toISODateUTC(d);
          } else {
            const str = String(v).trim();
            if (/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) {
              s[field] = str;
            } else {
              const d = new Date(str);
              if (!isNaN(d.getTime())) {
                s[field] = toISODateUTC(d);
              } else {
                s[field] = str;
              }
            }
          }
        };

        if (key === 'shippingCharge') {
          const num = typeof val === 'number' ? val : Number(String(val).replace(/[^0-9.-]/g, ''));
          s.shippingCharge = isNaN(num) ? 0 : num;
        } else if (key === 'shipDate' || key === 'returnDate') {
          setDateSafely(val, key);
        } else if (key === 'state') {
          const usStateRE = /^[A-Za-z]{2}$/;
          let v = val == null ? '' : String(val);
          v = v.toUpperCase().slice(0,2);
          if (!usStateRE.test(v)) {
            // leave uppercase 2 letters; allow non-standard if needed
          }
          s.state = v;
        } else {
          s[key] = val == null ? '' : String(val);
        }
      });

      const meaningful = s.refNum || s.company || s.shippingCharge > 0;
      if (meaningful) shipmentsOut.push(s);
    }

    return shipmentsOut;
  };

  const onClickImport = () => fileInputRef.current?.click();

  const onImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!window.confirm('Import will OVERWRITE each month sheet found in this file. Continue?')) {
      return;
    }

    try {
      setIsImporting(true);
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);

      const changed = [];

      for (const sheet of wb.worksheets) {
        const name = (sheet.name || '').trim();

        if (!/^([A-Za-z]+)\\s+(\\d{4})$/.test(name)) continue;
        const [, monthName, yearStr] = name.match(/^([A-Za-z]+)\\s+(\\d{4})$/) || [];
        if (!MONTHS.includes(monthName)) continue;

        const yearNum = parseInt(yearStr, 10);
        const rows = parseSheetToShipments(sheet);

        const y = YEAR_OPTIONS.includes(yearNum) ? yearNum : selectedYear;
        await setDoc(monthDocRef(y, monthName), {
          shipments: rows,
          lastModified: new Date().toISOString(),
          month: monthName,
          year: y,
        });

        changed.push({ month: monthName, year: y, count: rows.length });
      }

      if (changed.length === 0) {
        alert('No month sheets found (expecting tabs like "January 2025"). Nothing imported.');
      } else {
        const lines = changed
          .sort((a, b) => (a.year - b.year) || (MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month)))
          .map(c => `${c.month} ${c.year}: ${c.count} rows`).join('\\n');
        alert(`Import complete:\\n${lines}`);
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import Excel. Make sure you selected the "Export All (Excel)" file.');
    } finally {
      setIsImporting(false);
    }
  };

  // NEW: Import single month functionality
  const onClickImportMonth = () => monthFileInputRef.current?.click();

  const onImportMonthFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const targetMonth = isYTD ? editTargetMonth : selectedMonth;

    if (!window.confirm(
      `This will OVERWRITE data for ${targetMonth} ${selectedYear}.\\n\\n` +
      `The Excel file should have a sheet named either:\\n` +
      `• "${targetMonth}"\\n` +
      `• "${targetMonth} ${selectedYear}"\\n\\n` +
      `Continue?`
    )) {
      return;
    }

    try {
      setIsImporting(true);
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);

      let sheetToImport = null;
      let foundSheetName = null;

      // Look for a sheet named either "January" or "January 2025"
      for (const sheet of wb.worksheets) {
        const name = (sheet.name || '').trim();
        
        // Match "January 2025" format
        if (name === `${targetMonth} ${selectedYear}`) {
          sheetToImport = sheet;
          foundSheetName = name;
          break;
        }
        
        // Match just "January" format
        if (name === targetMonth) {
          sheetToImport = sheet;
          foundSheetName = name;
          break;
        }
      }

      if (!sheetToImport) {
        alert(
          `Could not find a sheet named "${targetMonth}" or "${targetMonth} ${selectedYear}".\\n\\n` +
          `Available sheets: ${wb.worksheets.map(s => s.name).join(', ')}`
        );
        return;
      }

      const rows = parseSheetToShipments(sheetToImport);

      await setDoc(monthDocRef(selectedYear, targetMonth), {
        shipments: rows,
        lastModified: new Date().toISOString(),
        month: targetMonth,
        year: selectedYear,
      });

      alert(
        `✅ Import successful!\\n\\n` +
        `Sheet: "${foundSheetName}"\\n` +
        `Imported to: ${targetMonth} ${selectedYear}\\n` +
        `Rows: ${rows.length}`
      );

    } catch (err) {
      console.error('Import month failed:', err);
      alert('Failed to import Excel. Please check the file format and try again.');
    } finally {
      setIsImporting(false);
    }
  };
  
  const companySummary = (() => {
    const summary = {};
    shipments.forEach((s) => {
      const key = s.company || '(Unassigned)';
      if (!summary[key]) summary[key] = { count: 0, total: 0 };
      summary[key].count += 1;
      summary[key].total += Number(s.shippingCharge || 0);
    });
    return Object.entries(summary)
      .map(([company, data]) => ({ company, ...data }))
      .sort((a, b) => b.total - a.total);
  })();

  const clientSummary = (() => {
    const summary = {};
    shipments.forEach((s) => {
      if (s.client && s.client.trim() !== '') {
        const key = s.client;
        if (!summary[key]) summary[key] = { count: 0, total: 0 };
        summary[key].count += 1;
        summary[key].total += Number(s.shippingCharge || 0);
      }
    });
    return Object.entries(summary)
      .map(([client, data]) => ({ client, ...data }))
      .sort((a, b) => a.client.localeCompare(b.client));
  })();

  const agentSummary = (() => {
    const summary = {};
    shipments.forEach((s) => {
      if (s.agent && s.agent.trim() !== '') {
        const key = s.agent;
        if (!summary[key]) summary[key] = { count: 0, total: 0 };
        summary[key].count += 1;
        summary[key].total += Number(s.shippingCharge || 0);
      }
    });
    return Object.entries(summary)
      .map(([agent, data]) => ({ agent, ...data }))
      .sort((a, b) => a.agent.localeCompare(b.agent));
  })();

  const stateSummary = (() => {
  const summary = {};
  shipments.forEach((s) => {
    const st = (s.state || '').trim();
    if (!st) return;
    const key = st.toUpperCase();
    if (!summary[key]) summary[key] = { count: 0, total: 0 };
    summary[key].count += 1;
    summary[key].total += Number(s.shippingCharge || 0);
  });
  return Object.entries(summary)
    .map(([state, data]) => ({ state, ...data }))
    .sort((a, b) => a.state.localeCompare(b.state));
})();



 
  const citySummary = (() => {
    const summary = {};
    shipments.forEach((s) => {
      if (s.city && s.city.trim() !== '') {
        const key = s.city;
        if (!summary[key]) summary[key] = { count: 0, total: 0 };
        summary[key].count += 1;
        summary[key].total += Number(s.shippingCharge || 0);
      }
    });
    return Object.entries(summary)
      .map(([city, data]) => ({ city, ...data }))
      .sort((a, b) => a.city.localeCompare(b.city));
  })();

  const totalCost = shipments.reduce((sum, s) => sum + Number(s.shippingCharge || 0), 0);
  const maxCount = Math.max(...companySummary.map((c) => c.count), 1);
  const maxClientCount = Math.max(...clientSummary.map((c) => c.count), 1);
  const maxAgentCount = Math.max(...agentSummary.map((c) => c.count), 1);
  const maxCityCount = Math.max(...citySummary.map((c) => c.count), 1);
  const maxStateCount = Math.max(...stateSummary.map((c) => c.count), 1);
  const chartColors = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
    '#06b6d4', '#6366f1', '#f97316', '#14b8a6', '#f43f5e',
  ];

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedShipments = React.useMemo(() => {
    // First filter by search query
    let filtered = shipments;
    
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = shipments.filter((shipment) => {
        return (
          (shipment.refNum && String(shipment.refNum).toLowerCase().includes(query)) ||
          (shipment.client && String(shipment.client).toLowerCase().includes(query)) ||
          (shipment.company && String(shipment.company).toLowerCase().includes(query)) ||
          (shipment.city && String(shipment.city).toLowerCase().includes(query)) ||
          (shipment.state && String(shipment.state).toLowerCase().includes(query)) ||
          (shipment.agent && String(shipment.agent).toLowerCase().includes(query)) ||
          (shipment.location && String(shipment.location).toLowerCase().includes(query)) ||
          (shipment.returnLocation && String(shipment.returnLocation).toLowerCase().includes(query)) ||
          (shipment.po && String(shipment.po).toLowerCase().includes(query)) ||
          (shipment.shipMethod && String(shipment.shipMethod).toLowerCase().includes(query)) ||
          (shipment.vehicleType && String(shipment.vehicleType).toLowerCase().includes(query))
        );
      });
    }

    // Then apply sorting
    if (!sortConfig.key) return filtered;

    const sorted = [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.key] ?? '';
      const bVal = b[sortConfig.key] ?? '';

      if (sortConfig.key === 'shippingCharge') {
        const aNum = Number(aVal);
        const bNum = Number(bVal);
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      if (sortConfig.key === 'shipDate' || sortConfig.key === 'returnDate') {
        const aIsBlank = !aVal || aVal === '';
        const bIsBlank = !bVal || bVal === '';
        
        if (aIsBlank && bIsBlank) return 0;
        if (aIsBlank) return sortConfig.direction === 'asc' ? -1 : 1;
        if (bIsBlank) return sortConfig.direction === 'asc' ? 1 : -1;
        
        const aDate = new Date(aVal).getTime();
        const bDate = new Date(bVal).getTime();
        return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (sortConfig.direction === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });

    return sorted;
  }, [shipments, sortConfig, searchQuery]);

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return ' ⇅';
    }
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const renderCell = (rowIndex, field, value) => {
    if (isYTD) {
      const isNumeric = field === 'shippingCharge';
      return (
        <div
          style={{
            width: '100%',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'not-allowed',
            color: '#475569',
          }}
          title="YTD aggregates all months. To edit, switch to a month or use '+ Add Row' with a target month."
        >
          {isNumeric && value ? `$${Number(value).toFixed(2)}` : value || ''}
        </div>
      );
    }

    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.field === field;
    const isNumeric = field === 'shippingCharge';
    const hasAutocomplete =
      field === 'company' ||
      field === 'agent' ||
      field === 'location' ||
      field === 'returnLocation' ||
      field === 'city' ||
      field === 'state' ||
      field === 'client' ||
      field === 'shipMethod' ||
      field === 'vehicleType';

    if (isEditing) {
      return (
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type={isNumeric ? 'number' : field.includes('Date') ? 'date' : 'text'}
            value={editValue}
            onChange={handleCellChange}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '4px 8px',
              border: '2px solid #3b82f6',
              borderRadius: '4px',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {hasAutocomplete && showDropdown && filteredOptions.length > 0 && dropdownRect && createPortal(
            <div
              style={{
                position: 'fixed',
                left: dropdownRect.left,
                top: dropdownRect.top,
                width: dropdownRect.width,
                maxHeight: '200px',
                overflowY: 'auto',
                background: 'white',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                zIndex: 10000,
                isolation: 'isolate',
              }}
            >
              {filteredOptions.map((opt, idx) => (
                <div
                  key={idx}
                  onMouseDown={() => selectOption(opt)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    background: 'white',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                >
                  {opt}
                </div>
              ))}
            </div>,
            document.body
          )}
        </div>
      );
    }

    return (
      <div
        onClick={() => startEditCell(rowIndex, field, value)}
        style={{
          width: '100%',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
        }}
        title="Click to edit"
      >
        {isNumeric && value ? `$${Number(value).toFixed(2)}` : value || ''}
      </div>
    );
  };

  const SingleAddModal = () => {
    if (!singleAddModal.open) return null;

    return createPortal(
      <div 
        role="dialog" aria-modal="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          isolation: 'isolate',
        }}
        onClick={() => setSingleAddModal({ open: false, type: '', value: '' })}
      >
        <div 
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            isolation: 'isolate',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
            Quick Add {singleAddModal.type.charAt(0).toUpperCase() + singleAddModal.type.slice(1)}
          </h3>

          <input
            type="text"
            value={singleAddModal.value}
            onChange={(e) => setSingleAddModal({ ...singleAddModal, value: e.target.value })}
            placeholder={`Enter ${singleAddModal.type} name`}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '14px',
              marginBottom: '16px',
              boxSizing: 'border-box',
            }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSingleAdd();
              }
            }}
          />
          
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setSingleAddModal({ open: false, type: '', value: '' })}
              style={{
                padding: '8px 16px',
                background: '#e2e8f0',
                color: '#475569',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSingleAdd}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const BulkAddModal = () => {
    if (!bulkAddModal.open) return null;

    return createPortal(
      <div 
        role="dialog" aria-modal="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          isolation: 'isolate',
        }}
        onClick={() => setBulkAddModal({ open: false, type: '', items: '' })}
      >
        <div 
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '600px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            isolation: 'isolate',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
            Bulk Add {bulkAddModal.type.charAt(0).toUpperCase() + bulkAddModal.type.slice(1)}s
          </h3>

          <div style={{ 
            padding: '12px', 
            background: '#fef3c7', 
            borderRadius: '8px', 
            marginBottom: '12px',
            fontSize: '13px',
            color: '#92400e'
          }}>
            <strong>⚠️ Typing Issue?</strong> If text appears backwards when typing, try <strong>copy/pasting</strong> your list instead, or use the "Quick Add One" button for single items.
          </div>

          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
            <strong>Separate entries with commas or new lines.</strong> This allows multi-word names like "Oncue Staging" to stay together.
            <br />
            <span style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
              Example: "Mesquite, Garland, Richardson" or each on a new line
            </span>
          </p>

          <textarea
            dir="ltr"
            value={bulkAddModal.items}
            onChange={(e) => setBulkAddModal({ ...bulkAddModal, items: e.target.value })}
            placeholder="Example:\nMesquite\nGarland\nRichardson\n\nor: Mesquite, Garland, Richardson"
            style={{
              width: '100%',
              height: '200px',
              padding: '12px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'Arial, sans-serif',
              marginBottom: '16px',
              boxSizing: 'border-box',
              resize: 'vertical',
              lineHeight: 1.4,
              direction: 'ltr',
              textAlign: 'left',
              unicodeBidi: 'embed',
            }}
            autoFocus
          />
                  
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setBulkAddModal({ open: false, type: '', items: '' })}
              style={{
                padding: '8px 16px',
                background: '#e2e8f0',
                color: '#475569',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleBulkAdd}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Add All
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };
  
  if (!isAuthenticated) {
    return <PasswordLogin onLogin={handleLogin} />;
  }

 if (showAnalytics) {
  return (
    <EnhancedAnalytics
      shipments={shipments}
      selectedYear={selectedYear}
      selectedMonth={selectedMonth}
      companies={companies}
      agents={agents}
      clients={clients}
      cities={cities}
      states={states}
      onBack={() => setShowAnalytics(false)}
      />
    );
  }


  return (
    <div style={{ minHeight: '100vh', background: 'white' }}>
      <div style={{ maxWidth: '98%', margin: '0 auto', padding: '16px' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>
              {selectedYear} Freight Booked by Company
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              {selectedMonth} {selectedYear}
              {isYTD && <span style={{ fontSize: '11px', color: '#475569', marginLeft: '8px' }}>YTD view • rows are read-only</span>}
              {!isYTD && unsavedRows.size > 0 && (
                <span style={{ 
                  fontSize: '11px', 
                  marginLeft: '8px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: '600',
                  background: '#f59e0b',
                  color: 'white'
                }}
                title={`${unsavedRows.size} row(s) have unsaved changes`}
                >
                  ⚠️ {unsavedRows.size} unsaved row{unsavedRows.size !== 1 ? 's' : ''}
                </span>
              )}
              {!isYTD && unsavedRows.size === 0 && (
                <span style={{ 
                  fontSize: '11px', 
                  marginLeft: '8px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: '600',
                  background: '#10b981',
                  color: 'white'
                }}>
                  ✓ All saved
                </span>
              )}
              <span style={{ fontSize: '11px', color: '#3b82f6', marginLeft: '8px' }}>🌐 Multi-user enabled</span>
              <span style={{ 
                fontSize: '11px', 
                color: 'white',
                background: statusEnabled ? '#10b981' : '#64748b',
                padding: '2px 8px',
                borderRadius: '4px',
                marginLeft: '8px',
                fontWeight: '600'
              }}>
                {statusEnabled ? '📊 Stats Visible' : '📊 Stats Hidden'}
              </span>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#64748b', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              🔒 Logout
            </button>

            <button 
              onClick={handleManualSave} 
              disabled={isYTD || saveStatus === 'saving'}
              style={{ 
                padding: '8px 16px', 
                background: isYTD || saveStatus === 'saving' ? '#9ca3af' : '#10b981', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '13px', 
                fontWeight: '600', 
                cursor: isYTD || saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title={isYTD ? 'Cannot save in YTD view' : `Save all rows at once (${unsavedRows.size} unsaved)`}
            >
              💾 Save All
            </button>

            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              {YEAR_OPTIONS.map((y) => (<option key={y} value={y}>{y}</option>))}
            </select>

            <select value={selectedMonth} onChange={(e) => handleMonthChange(e.target.value)} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              {MONTHS_WITH_YTD.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>

            {isYTD && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: '#475569' }}>Edit to month:</label>
                <select value={editTargetMonth} onChange={(e) => setEditTargetMonth(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13 }}>
                  {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}

			{/* ← ADD THIS ANALYTICS BUTTON HERE */}
  <button 
    onClick={() => setShowAnalytics(true)}
    style={{ 
      padding: '8px 16px', 
      background: '#7c3aed', 
      color: 'white', 
      border: 'none', 
      borderRadius: '8px', 
      fontSize: '13px', 
      fontWeight: '600', 
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }}
  >
    <span>📊</span>
    Analytics
  </button>

  <button 
              onClick={() => setShowQuickAdds(!showQuickAdds)} 
              style={{ 
                padding: '8px 16px', 
                background: showQuickAdds ? '#059669' : '#14b8a6', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '13px', 
                fontWeight: '600', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title={showQuickAdds ? 'Hide quick adds' : 'Show quick adds'}
            >
              <span>⚡</span>
              {showQuickAdds ? 'Hide Quick Adds' : 'Quick Adds'}
            </button>

            {showQuickAdds && (
              <>
                <button onClick={() => setSingleAddModal({ open: true, type: 'company', value: '' })} style={{ padding: '8px 12px', background: '#14b8a6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Quick add one company">
                  ⚡ Company
                </button>

                <button onClick={() => setSingleAddModal({ open: true, type: 'location', value: '' })} style={{ padding: '8px 12px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Quick add one location">
                  ⚡ Location
                </button>

                <button onClick={() => setSingleAddModal({ open: true, type: 'agent', value: '' })} style={{ padding: '8px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Quick add one agent">
                  ⚡ Agent
                </button>

                <button onClick={() => setSingleAddModal({ open: true, type: 'city', value: '' })} style={{ padding: '8px 12px', background: '#a855f7', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Quick add one city">
                  ⚡ City
                </button>

                <button onClick={() => setSingleAddModal({ open: true, type: 'state', value: '' })} style={{ padding: '8px 12px', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Quick add one state">
                  ⚡ State
                </button>

                <button onClick={() => setSingleAddModal({ open: true, type: 'client', value: '' })} style={{ padding: '8px 12px', background: '#f472b6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Quick add one client">
                  ⚡ Client
                </button>
              </>
            )}

            <button 
              onClick={() => setShowBulkOptions(!showBulkOptions)} 
              style={{ 
                padding: '8px 16px', 
                background: showBulkOptions ? '#059669' : '#6b7280', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '13px', 
                fontWeight: '600', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title={showBulkOptions ? 'Hide bulk entry' : 'Show bulk entry'}
            >
              <span>{showBulkOptions ? '📂' : '📁'}</span>
              {showBulkOptions ? 'Hide Bulk entry' : 'Show Bulk entry'}
            </button>

            {showBulkOptions && (
              <>
                <button onClick={() => setBulkAddModal({ open: true, type: 'company', items: '' })} style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Add companies (one per line or paste list)">
                  📝 Bulk Add Companies
                </button>

                <button onClick={() => setBulkAddModal({ open: true, type: 'location', items: '' })} style={{ padding: '8px 12px', background: '#155e75', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Add locations (one per line or paste list)">
                  📝 Bulk Add Locations
                </button>

                <button onClick={() => setBulkAddModal({ open: true, type: 'agent', items: '' })} style={{ padding: '8px 12px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title='Add agents (e.g., "J.DOE" or "John Doe" per line)'>
                  📝 Bulk Add Agents
                </button>

                <button onClick={() => setBulkAddModal({ open: true, type: 'city', items: '' })} style={{ padding: '8px 12px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Add cities (one per line or paste list)">
                  📝 Bulk Add Cities
                </button>

                <button onClick={onClickImportCitiesJSON} style={{ padding: '8px 12px', background: '#9333ea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Import cities from JSON file">
                  📁 Import Cities (JSON)
                </button>

                <button onClick={() => setBulkAddModal({ open: true, type: 'state', items: '' })} style={{ padding: '8px 12px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Add states (2-letter codes, one per line)">
                  📝 Bulk Add States
                </button>

                <button onClick={() => setBulkAddModal({ open: true, type: 'client', items: '' })} style={{ padding: '8px 12px', background: '#db2777', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Add clients (one per line or paste list)">
                  📝 Bulk Add Clients
                </button>

                <button onClick={onClickImportClientsJSON} style={{ padding: '8px 12px', background: '#ec4899', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} title="Import clients from JSON file">
                  📁 Import Clients (JSON)
                </button>
              </>
            )}

            <button onClick={exportMonthExcel} style={{ padding: '8px 12px', background: '#166534', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              ⬇️ Export {isYTD ? 'YTD' : 'Month'} (Excel)
            </button>

            <button onClick={exportAllMonthsExcel} style={{ padding: '8px 12px', background: '#047857', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              ⬇️ Export All (Excel)
            </button>

            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={onImportFileChange} style={{ display: 'none' }} />
            
            <input ref={monthFileInputRef} type="file" accept=".xlsx" onChange={onImportMonthFileChange} style={{ display: 'none' }} />
            
            <input ref={jsonFileInputRef} type="file" accept=".json" onChange={handleImportCitiesJSON} style={{ display: 'none' }} />
            
            <input ref={jsonClientsInputRef} type="file" accept=".json" onChange={handleImportClientsJSON} style={{ display: 'none' }} />
            
            <button onClick={onClickImport} disabled={isImporting} style={{ padding: '8px 12px', background: isImporting ? '#9ca3af' : '#312e81', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: isImporting ? 'not-allowed' : 'pointer' }}>
              {isImporting ? '⏳ Importing…' : '⬆️ Import All (Excel)'}
            </button>

            <button 
              onClick={onClickImportMonth} 
              disabled={isImporting} 
              style={{ 
                padding: '8px 12px', 
                background: isImporting ? '#9ca3af' : '#4c1d95', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '13px', 
                fontWeight: '600', 
                cursor: isImporting ? 'not-allowed' : 'pointer' 
              }}
              title={`Import data for ${isYTD ? editTargetMonth : selectedMonth} only`}
            >
              {isImporting ? '⏳ Importing…' : `⬆️ Import ${isYTD ? editTargetMonth : selectedMonth} (Excel)`}
            </button>
            
            <button onClick={() => setStatusEnabled(!statusEnabled)} style={{ padding: '8px 16px', background: statusEnabled ? '#10b981' : '#64748b', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} title={statusEnabled ? 'Click to hide statistics' : 'Click to show statistics'}>
              <span style={{ fontSize: '16px' }}>{statusEnabled ? '👁️' : '👁️‍🗨️'}</span>
              {statusEnabled ? 'Hide Stats' : 'Show Stats'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '12px', padding: '20px', color: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '8px' }}>Total Revenue</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', borderRadius: '12px', padding: '20px', color: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '8px' }}>Total Shipments</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{shipments.length}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', borderRadius: '12px', padding: '20px', color: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '8px' }}>Active Companies</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{companySummary.length}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', borderRadius: '12px', padding: '20px', color: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '8px' }}>Avg Per Shipment</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>${shipments.length > 0 ? (totalCost / shipments.length).toFixed(2) : '0.00'}</div>
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
          <div style={{ background: '#1d4ed8', color: 'white', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
            <h2 style={{ fontWeight: 'bold', fontSize: '14px' }}>Shipment Details - {selectedMonth} {selectedYear}</h2>
            <button
              onClick={handleAddRow}
              style={{ background: '#2563eb', color: 'white', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', border: 'none', cursor: 'pointer', fontWeight: '600', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
            >
              + Add Row{isYTD ? ` to ${editTargetMonth}` : ''}
            </button>
          </div>

          <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🔍</span>
              <input
                type="text"
                placeholder="Search shipments (reference #, client, company, city, state, agent, location, PO, etc.)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '13px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    padding: '8px 12px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                  title="Clear search"
                >
                  ✕ Clear
                </button>
              )}
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
                {sortedShipments.length} of {shipments.length} rows
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', height: 'calc(100vh - 400px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th onClick={() => handleSort('refNum')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    REFERENCE #{getSortIcon('refNum')}
                  </th>
                  <th onClick={() => handleSort('client')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    CLIENT{getSortIcon('client')}
                  </th>
                  <th onClick={() => handleSort('shipDate')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    SHIP DATE{getSortIcon('shipDate')}
                  </th>
                  <th onClick={() => handleSort('returnDate')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    RETURN DATE{getSortIcon('returnDate')}
                  </th>
                  <th onClick={() => handleSort('location')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    LOCATION{getSortIcon('location')}
                  </th>
                  <th onClick={() => handleSort('returnLocation')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    RETURN LOCATION{getSortIcon('returnLocation')}
                  </th>
                  <th onClick={() => handleSort('city')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    CITY{getSortIcon('city')}
                  </th>
                  <th onClick={() => handleSort('state')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    STATE{getSortIcon('state')}
                  </th>
                  <th onClick={() => handleSort('company')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    COMPANY{getSortIcon('company')}
                  </th>
                  <th onClick={() => handleSort('shipMethod')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    SHIP METHOD{getSortIcon('shipMethod')}
                  </th>
                  <th onClick={() => handleSort('vehicleType')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    VEHICLE TYPE{getSortIcon('vehicleType')}
                  </th>
                  <th onClick={() => handleSort('shippingCharge')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    CHARGES{getSortIcon('shippingCharge')}
                  </th>
                  <th onClick={() => handleSort('po')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    PO{getSortIcon('po')}
                  </th>
                  <th onClick={() => handleSort('agent')} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
                    AGENT{getSortIcon('agent')}
                  </th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>
                    SAVE
                  </th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedShipments.map((s, idx) => {
                  const isUnsaved = unsavedRows.has(idx);
                  return (
                  <tr key={idx} style={{ background: isUnsaved ? '#fef3c7' : (idx % 2 === 0 ? 'white' : '#f8fafc') }}>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'refNum', s.refNum)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'client', s.client)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'shipDate', s.shipDate)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'returnDate', s.returnDate)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'location', s.location)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'returnLocation', s.returnLocation)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'city', s.city)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'state', s.state)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'company', s.company)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'shipMethod', s.shipMethod)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'vehicleType', s.vehicleType)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'shippingCharge', s.shippingCharge)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'po', s.po)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0' }}>{renderCell(idx, 'agent', s.agent)}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center' }}>
                      {isUnsaved && !isYTD ? (
                        <button
                          onClick={() => handleSaveRow(idx)}
                          style={{
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontWeight: '600',
                          }}
                          title="Save this row"
                        >
                          💾 Save
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>—</span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeleteRow(idx)}
                        disabled={isYTD}
                        style={{
                          background: isYTD ? '#cbd5e1' : '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: isYTD ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                        }}
                        title={isYTD ? 'Cannot delete from YTD view' : 'Delete this row'}
                      >
                        🗑️ Del
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {statusEnabled && (
          <>
            <div ref={costPerCompanyRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginTop: '24px' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Cost Per Company</h3>
              {companySummary.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <table style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '4px', fontWeight: '600' }}>Company</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Total Cost</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Shipments</th>
                        </tr>
                      </thead>
                      <tbody>
                        {companySummary.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                            <td style={{ padding: '4px' }}>{item.company}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>
                              ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{item.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px', color: '#475569' }}>Cost Distribution</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {companySummary.map((item, idx) => (
                        <div key={idx}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '10px' }}>
                            <span style={{ fontWeight: '600', color: '#475569' }}>{item.company}</span>
                            <span style={{ color: '#64748b' }}>
                              ${item.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ flex: 1, height: '20px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${(item.total / totalCost) * 100}%`,
                                  height: '100%',
                                  background: chartColors[idx % chartColors.length],
                                  borderRadius: '4px',
                                  transition: 'width 0.3s ease',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '10px', color: '#64748b', minWidth: '40px', textAlign: 'right' }}>
                              {((item.total / totalCost) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No data for {selectedMonth}</p>
              )}
            </div>

            <div ref={shipmentCountRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginTop: '24px' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Shipment Count by Company</h3>
              {companySummary.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {companySummary.map((item, idx) => (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '10px' }}>
                        <span style={{ fontWeight: '600', color: '#475569' }}>{item.company}</span>
                        <span style={{ color: '#64748b' }}>{item.count}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ flex: 1, height: '20px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${(item.count / maxCount) * 100}%`,
                              height: '100%',
                              background: chartColors[idx % chartColors.length],
                              borderRadius: '4px',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No data for {selectedMonth}</p>
              )}
            </div>

            <div ref={revenueDistRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginTop: '24px' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Revenue Distribution</h3>
              {companySummary.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
                  {companySummary.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 16px',
                        background: chartColors[idx % chartColors.length],
                        color: 'white',
                        borderRadius: '8px',
                        fontSize: '12px',
                        minWidth: '140px',
                        textAlign: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      }}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>{item.company}</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                        ${item.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                      <div style={{ fontSize: '10px', opacity: 0.9, marginTop: '2px' }}>
                        {((item.total / totalCost) * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No data for {selectedMonth}</p>
              )}
            </div>

            <div ref={clientStatsRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Shipments by Client</h3>
              {clientSummary.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <table style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '4px', fontWeight: '600' }}>Client</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Shipments</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientSummary.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                            <td style={{ padding: '4px' }}>{item.client}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{item.count}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>
                              ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px', color: '#475569' }}>Shipment Count by Client</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {clientSummary.map((item, idx) => (
                        <div key={idx}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '10px' }}>
                            <span style={{ fontWeight: '600', color: '#475569' }}>{item.client}</span>
                            <span style={{ color: '#64748b' }}>{item.count}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ flex: 1, height: '20px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${(item.count / maxClientCount) * 100}%`,
                                  height: '100%',
                                  background: chartColors[idx % chartColors.length],
                                  borderRadius: '4px',
                                  transition: 'width 0.3s ease',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No client data for {selectedMonth}</p>
              )}
            </div>

            <div ref={agentStatsRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Shipments by Agent</h3>
              {agentSummary.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <table style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '4px', fontWeight: '600' }}>Agent</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Shipments</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agentSummary.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                            <td style={{ padding: '4px' }}>{item.agent}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{item.count}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>
                              ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px', color: '#475569' }}>Shipment Count by Agent</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {agentSummary.map((item, idx) => (
                        <div key={idx}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '10px' }}>
                            <span style={{ fontWeight: '600', color: '#475569' }}>{item.agent}</span>
                            <span style={{ color: '#64748b' }}>{item.count}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ flex: 1, height: '20px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${(item.count / maxAgentCount) * 100}%`,
                                  height: '100%',
                                  background: chartColors[idx % chartColors.length],
                                  borderRadius: '4px',
                                  transition: 'width 0.3s ease',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No agent data for {selectedMonth}</p>
              )}
            </div>

            <div ref={cityStatsRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Shipments by City</h3>
              {citySummary.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <table style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '4px', fontWeight: '600' }}>City</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Shipments</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {citySummary.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                            <td style={{ padding: '4px' }}>{item.city}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{item.count}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>
                              ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px', color: '#475569' }}>Shipment Count by City</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {citySummary.map((item, idx) => (
                        <div key={idx}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '10px' }}>
                            <span style={{ fontWeight: '600', color: '#475569' }}>{item.city}</span>
                            <span style={{ color: '#64748b' }}>{item.count}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ flex: 1, height: '20px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${(item.count / maxCityCount) * 100}%`,
                                  height: '100%',
                                  background: chartColors[idx % chartColors.length],
                                  borderRadius: '4px',
                                  transition: 'width 0.3s ease',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No city data for {selectedMonth}</p>
              )}
            </div>

            <div ref={stateStatsRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Shipments by State</h3>
              {stateSummary.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <table style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '4px', fontWeight: '600' }}>State</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Shipments</th>
                          <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stateSummary.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                            <td style={{ padding: '4px' }}>{item.state}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{item.count}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>
                              ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px', color: '#475569' }}>Shipment Count by State</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {stateSummary.map((item, idx) => (
                        <div key={idx}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '10px' }}>
                            <span style={{ fontWeight: '600', color: '#475569' }}>{item.state}</span>
                            <span style={{ color: '#64748b' }}>{item.count}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ flex: 1, height: '20px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${(item.count / maxStateCount) * 100}%`,
                                  height: '100%',
                                  background: chartColors[idx % chartColors.length],
                                  borderRadius: '4px',
                                  transition: 'width 0.3s ease',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No state data for {selectedMonth}</p>
              )}
            </div>
          </>
        )}
      </div>
      <SingleAddModal />
      <BulkAddModal />
    </div>
  );
}

export default App;















































