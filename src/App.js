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
  const [lastSaved, setLastSaved] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [showQuickAdds, setShowQuickAdds] = useState(false);
  const fileInputRef = useRef(null);
  const jsonFileInputRef = useRef(null);
  const jsonClientsInputRef = useRef(null);

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [statusEnabled, setStatusEnabled] = useState(true);

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

  useEffect(() => {
    document.title = `Freight Dashboard – ${selectedMonth} ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const cfgRef = doc(db, 'freight-config', 'global');

    (async () => {
      const snap = await getDoc(cfgRef);
      if (!snap.exists()) {
        await setDoc(cfgRef, {
          companies: DEFAULT_COMPANIES,
          locations: DEFAULT_LOCATIONS,
          agents: DEFAULT_AGENTS,
          cities: DEFAULT_CITIES,
          states: DEFAULT_STATES,
          clients: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        const data = snap.data() || {};
        const payload = {};
        if (!Array.isArray(data.companies)) payload.companies = DEFAULT_COMPANIES;
        if (!Array.isArray(data.locations)) payload.locations = DEFAULT_LOCATIONS;
        if (!Array.isArray(data.agents)) payload.agents = DEFAULT_AGENTS;
        if (!Array.isArray(data.cities)) payload.cities = DEFAULT_CITIES;
        if (!Array.isArray(data.states)) payload.states = DEFAULT_STATES;
        if (!Array.isArray(data.clients)) payload.clients = [];
        if (Object.keys(payload).length) {
          payload.updatedAt = new Date().toISOString();
          await setDoc(cfgRef, payload, { merge: true });
        }
      }
    })();

    const unsub = onSnapshot(cfgRef, (d) => {
      if (d.exists()) {
        const data = d.data() || {};
        setCompanies(Array.isArray(data.companies) && data.companies.length ? data.companies : DEFAULT_COMPANIES);
        setLocations(Array.isArray(data.locations) && data.locations.length ? data.locations : DEFAULT_LOCATIONS);
        setAgents(Array.isArray(data.agents) && data.agents.length ? data.agents : DEFAULT_AGENTS);
        setCities(Array.isArray(data.cities) && data.cities.length ? data.cities : DEFAULT_CITIES);
        setStates(Array.isArray(data.states) && data.states.length ? data.states : DEFAULT_STATES);
        setClients(Array.isArray(data.clients) ? data.clients : []);
      } else {
        setCompanies(DEFAULT_COMPANIES);
        setLocations(DEFAULT_LOCATIONS);
        setAgents(DEFAULT_AGENTS);
        setCities(DEFAULT_CITIES);
        setStates(DEFAULT_STATES);
        setClients([]);
      }
    });

    return () => unsub();
  }, []);

  const buildDefaultShipment = () => ({
    id: Date.now(),
    refNum: '',
    client: '',
    shipDate: '',
    returnDate: '',
    location: locations?.[0] || '',
    returnLocation: '',
    city: '',
    state: '',
    company: companies?.[0] || '',
    shipMethod: SHIP_METHODS[0],
    vehicleType: VEHICLE_TYPES?.[0] || '',
    shippingCharge: 0,
    po: '',
    agent: agents?.[0] || '',
  });

  useEffect(() => {
    const initializeMonths = async () => {
      try {
        for (const month of MONTHS) {
          const mref = monthDocRef(selectedYear, month);
          const snapshot = await getDoc(mref);
          const missing = !snapshot.exists();
          const empty = !missing && (!snapshot.data().shipments || snapshot.data().shipments.length === 0);
          if (missing || empty) {
            await setDoc(mref, {
              shipments: [buildDefaultShipment()],
              lastModified: new Date().toISOString(),
              month,
              year: selectedYear,
            });
          }
        }
      } catch (err) {
        console.error('Error initializing months:', err);
      }
    };
    initializeMonths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, locations, agents, cities, selectedYear]);

  useEffect(() => {
    if (isYTD) {
      const unsubs = [];
      const bucket = {};

      const refresh = () => {
        const all = MONTHS.flatMap((m) => bucket[m] || []);
        setShipments(all);
      };

      MONTHS.forEach((m) => {
        const ref = monthDocRef(selectedYear, m);
        const unsub = onSnapshot(ref, (snap) => {
          bucket[m] = snap.exists() ? (snap.data().shipments || []) : [];
          refresh();
        });
        unsubs.push(unsub);
      });

      return () => unsubs.forEach((u) => u());
    }

    const mref = monthDocRef(selectedYear, selectedMonth);
    const unsubscribe = onSnapshot(mref, (docSnapshot) => {
      if (docSnapshot.exists()) {
        setShipments(docSnapshot.data().shipments || []);
      } else {
        setShipments([]);
      }
    });
    return () => unsubscribe();
  }, [selectedMonth, selectedYear, isYTD]);

  useEffect(() => {
    if (!showDropdown) return;
    const computeDropdownPosition = () => {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const maxHeight = 400;
      const padding = 6;

      const spaceBelow = vh - rect.bottom - padding;
      const spaceAbove = rect.top - padding;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const height = Math.min(openUp ? spaceAbove - padding : spaceBelow - padding, maxHeight);

      setDropdownRect({
        top: openUp ? rect.top - height - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        height: Math.max(180, height),
      });
    };
    computeDropdownPosition();
    const onScrollResize = () => computeDropdownPosition();
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [showDropdown, editValue]);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAuthenticated(false);
      sessionStorage.removeItem('isAuthenticated');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const saveToFirebase = async (updatedShipments) => {
    if (isYTD) {
      alert('In YTD view, existing rows are read-only. Use "+ Add Row" to add to your target month.');
      return;
    }
    try {
      setIsSaving(true);
      const mref = monthDocRef(selectedYear, selectedMonth);
      await setDoc(mref, {
        shipments: updatedShipments,
        lastModified: new Date().toISOString(),
        month: selectedMonth,
        year: selectedYear,
      });
      setLastSaved(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Error saving to Firebase:', error);
      alert('Failed to save. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMonthChange = async (newMonth) => {
    setSelectedMonth(newMonth);
    if (newMonth === 'YTD') return;

    try {
      const mref = monthDocRef(selectedYear, newMonth);
      const snapshot = await getDoc(mref);
      const missing = !snapshot.exists();
      const empty = !missing && (!snapshot.data().shipments || snapshot.data().shipments.length === 0);
      if (missing || empty) {
        await setDoc(mref, {
          shipments: [buildDefaultShipment()],
          lastModified: new Date().toISOString(),
          month: newMonth,
          year: selectedYear,
        });
      }
    } catch (e) {
      console.error('Error preparing month:', e);
    }
  };

  const handleCellClick = (rowIndex, field) => {
    if (isYTD) return;
    if (!shipments[rowIndex]) return;
    const value = shipments[rowIndex][field];
    setEditingCell({ rowIndex, field });
    setEditValue(value ?? '');

    if (field === 'company') {
      setFilteredOptions(companies);
      setShowDropdown(true);
    } else if (field === 'agent') {
      setFilteredOptions(agents);
      setShowDropdown(true);
    } else if (field === 'location' || field === 'returnLocation') {
      setFilteredOptions(locations);
      setShowDropdown(true);
    } else if (field === 'city') {
      setFilteredOptions(cities);
      setShowDropdown(true);
    } else if (field === 'state') {
      setFilteredOptions(states);
      setShowDropdown(true);
    } else if (field === 'client') {
      setFilteredOptions(clients);
      setShowDropdown(true);
    } else if (field === 'shipMethod') {
      setFilteredOptions(SHIP_METHODS);
      setShowDropdown(true);
    } else if (field === 'vehicleType') {
      setFilteredOptions(VEHICLE_TYPES);
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  const handleCellChange = (e) => {
    const value = e.target.value;
    setEditValue(value);

    const field = editingCell?.field;
    if (!field) return;

    if (['company', 'agent', 'location', 'returnLocation', 'city', 'state', 'client', 'shipMethod', 'vehicleType'].includes(field)) {
      const options =
        field === 'company'
          ? companies
          : field === 'agent'
          ? agents
          : field === 'city'
          ? cities
          : field === 'state'
          ? states
          : field === 'client'
          ? clients
          : field === 'shipMethod'
          ? SHIP_METHODS
          : field === 'vehicleType'
          ? VEHICLE_TYPES
          : locations;

      const filtered = options.filter((option) =>
        String(option).toLowerCase().includes(String(value).toLowerCase())
      );
      setFilteredOptions(filtered);
      setShowDropdown(filtered.length > 0);
    }
  };

  const handleSelectOption = (option) => {
    setEditValue(option);
    setShowDropdown(false);
    setDropdownRect(null);
    inputRef.current?.focus();
  };

  const handleCellBlur = () => {
    setTimeout(() => {
      if (editingCell) {
        const { rowIndex, field } = editingCell;
        const newShipments = [...shipments];
        if (field === 'shippingCharge') {
          const numValue = parseFloat(editValue);
          newShipments[rowIndex][field] = isNaN(numValue) ? 0 : numValue;
        } else if (field === 'state') {
          const usStateRE = /^[A-Za-z]{2}$/;
          let val = (editValue || '').toString().trim();
          if (val) {
            val = val.toUpperCase().slice(0, 2);
            if (!usStateRE.test(val)) {
              // keep as-is if not two letters, but uppercase
              // (allows future non-US states if needed)
            }
          }
          newShipments[rowIndex][field] = val;
        } else {
          newShipments[rowIndex][field] = editValue;
        }
        saveToFirebase(newShipments);
        setEditingCell(null);
        setEditValue('');
        setShowDropdown(false);
        setDropdownRect(null);
      }
    }, 200);
  };

  const handleKeyDown = (e, rowIndex, field) => {
    const fields = [
      'refNum', 'client',
      'shipDate', 'returnDate',
      'location', 'returnLocation', 'city', 'state',
      'company', 'shipMethod', 'vehicleType',
      'shippingCharge', 'po', 'agent',
    ];

    const currentIndex = fields.indexOf(field);

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setEditingCell(null);
      setEditValue('');
      setShowDropdown(false);
      setDropdownRect(null);
      return;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && filteredOptions.length > 0) {
        handleSelectOption(filteredOptions[0]);
      }
      handleCellBlur();
      if (rowIndex < shipments.length - 1) {
        setTimeout(() => handleCellClick(rowIndex + 1, field), 250);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleCellBlur();
      if (currentIndex < fields.length - 1) {
        setTimeout(() => handleCellClick(rowIndex, fields[currentIndex + 1]), 250);
      }
    }
  };

  const handleAddRow = async () => {
    if (isYTD) {
      try {
        const targetRef = monthDocRef(selectedYear, editTargetMonth);
        const snap = await getDoc(targetRef);
        const existing = snap.exists() ? (snap.data().shipments || []) : [];
        const updated = [buildDefaultShipment(), ...existing];
        await setDoc(targetRef, {
          shipments: updated,
          lastModified: new Date().toISOString(),
          month: editTargetMonth,
          year: selectedYear,
        });
        alert(`Row added to ${editTargetMonth} ${selectedYear}.`);
      } catch (e) {
        console.error('Add row (YTD) failed:', e);
        alert('Failed to add row to target month.');
      }
      return;
    }

    const newShipment = buildDefaultShipment();
    const updatedShipments = [newShipment, ...shipments];
    setShipments(updatedShipments);
    saveToFirebase(updatedShipments);
    setTimeout(() => {
      handleCellClick(0, 'refNum');
    }, 300);
  };

  const handleDeleteRow = (index) => {
    if (isYTD) {
      alert('In YTD view, deleting existing rows is disabled.');
      return;
    }
    if (window.confirm('Delete this shipment?')) {
      const updatedShipments = shipments.filter((_, i) => i !== index);
      saveToFirebase(updatedShipments);
    }
  };

  const handleBulkAdd = async () => {
    // Split by newlines and commas to create individual entries
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
    const dataRows = mapRowsForExcel(shipments);

    buildDataSheetPretty(wb, `${selectedMonth} ${selectedYear}`, dataRows);

    if (isYTD) {
      const { rows, monthlyTotals, grandTotal } = await buildYtdMatrix();
      const sheet = wb.addWorksheet('YTD Summary', { views: [{ state: 'frozen', ySplit: 1 }] });

      const header = ['Company', ...MONTHS, 'Total'];
      sheet.columns = header.map((h, i) => ({ header: h, key: `c${i}` }));
      sheet.addRow(header);
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { vertical: 'middle' };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      sheet.autoFilter = { from: 'A1', to: 'N1' };

      rows.forEach(r => {
        const rowVals = [r.company, ...r.monthsVals, r.total];
        sheet.addRow(rowVals);
      });

      const totalsRow = ['TOTAL', ...monthlyTotals, grandTotal];
      const last = sheet.addRow(totalsRow);
      last.font = { bold: true };
      last.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };

      for (let c = 2; c <= 14; c++) {
        sheet.getColumn(c).numFmt = '$#,##0.00';
      }

      autosizeColumns(sheet, { min: 10, max: 32, buffer: 2 });
    }

    const dash = wb.addWorksheet('Dashboard', { pageSetup: { orientation: 'landscape' } });

    const addImg = (base64, tlRow, tlCol, widthPx, heightPx) => {
      if (!base64) return;
      const imgId = wb.addImage({ base64, extension: 'png' });
      dash.addImage(imgId, {
        tl: { col: tlCol, row: tlRow },
        ext: { width: widthPx, height: heightPx },
        editAs: 'oneCell',
      });
    };

    const title = dash.getCell('A1');
    title.value = `Dashboard – ${selectedMonth} ${selectedYear}`;
    title.font = { bold: true, size: 16 };
    dash.mergeCells('A1:F1');

    addImg(imgCostPerCompany, 2, 0, 900, 350);
    addImg(imgShipmentCount, 18, 0, 900, 350);
    addImg(imgRevenueDist, 34, 0, 900, 350);
    addImg(imgClientStats, 50, 0, 900, 350);
    addImg(imgAgentStats, 66, 0, 900, 350);
    addImg(imgCityStats, 82, 0, 900, 350);
	addImg(imgStateStats,     98, 0, 900, 350);

    const buf = await wb.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `freight-${selectedYear}-${selectedMonth}-${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  const exportAllMonthsExcel = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      const monthToRowsMap = {};

      for (const month of MONTHS) {
        const docSnap = await getDoc(monthDocRef(selectedYear, month));
        const list = docSnap.exists() ? docSnap.data().shipments || [] : [];
        const rows = mapRowsForExcel(list);
        monthToRowsMap[month] = rows;
        buildDataSheetPretty(wb, `${month} ${selectedYear}`, rows);
      }

      buildAllRowsSheet(wb, selectedYear, monthToRowsMap);

      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `freight-${selectedYear}-all-months-${new Date().toISOString().split('T')[0]}.xlsx`
      );
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message}`);
    }
  };

  const headerKeyMap = {
    'reference #': 'refNum',
    'client': 'client',
    'ship date': 'shipDate',
    'return date': 'returnDate',
    'location': 'location',
    'return location': 'returnLocation',
    'city': 'city',
    'state': 'state',
    'company': 'company',
    'ship method': 'shipMethod',
    'vehicle type': 'vehicleType',
    'charges': 'shippingCharge',
    'po': 'po',
    'agent': 'agent',
  };

  const parseSheetToShipments = (sheet) => {
    if (!sheet || sheet.rowCount < 2) return [];

    const headerRow = sheet.getRow(1);
    const idxToKey = {};
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const label = String(cell.value || '').trim().toLowerCase();
      if (label && headerKeyMap[label]) {
        idxToKey[colNumber] = headerKeyMap[label];
      }
    });

    const shipmentsOut = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      if (!row || row.cellCount === 0) continue;

      const s = {
        id: Date.now() + r,
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
    if (!sortConfig.key) return shipments;

    const sorted = [...shipments].sort((a, b) => {
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
  }, [shipments, sortConfig]);

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
            onBlur={handleCellBlur}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, field)}
            style={{
              width: '100%',
              padding: '4px 8px',
              border: '2px solid #3b82f6',
              outline: 'none',
              fontSize: '12px',
              textTransform: field === 'state' ? 'uppercase' : 'none',
            }}
            step={isNumeric ? '0.01' : undefined}
            autoComplete="off"
            maxLength={field === 'state' ? 2 : undefined}
          />
          {hasAutocomplete && showDropdown && filteredOptions.length > 0 && dropdownRect &&
            createPortal(
              <div
                style={{
                  position: 'fixed',
                  zIndex: 9999,
                  top: dropdownRect.top,
                  left: dropdownRect.left,
                  width: dropdownRect.width,
                  maxHeight: dropdownRect.height,
                  overflowY: 'auto',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  boxShadow: '0 12px 24px rgba(0,0,0,0.18)',
                }}
              >
                {filteredOptions.map((option, idx) => (
                  <div
                    key={idx}
                    onMouseDown={() => handleSelectOption(option)}
                    style={{ padding: '10px 12px', fontSize: 13, cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#eef2ff')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                  >
                    {option}
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
        onClick={() => handleCellClick(rowIndex, field)}
        style={{
          width: '100%',
          padding: '4px 8px',
          cursor: isYTD ? 'not-allowed' : 'cell',
          fontSize: '12px',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#eff6ff')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {isNumeric && value ? `$${Number(value).toFixed(2)}` : value || ''}
      </div>
    );
  };

  const handleSingleAdd = async () => {
    const value = singleAddModal.value.trim();
    
    if (!value) {
      alert('Please enter a value');
      return;
    }

    const type = singleAddModal.type;
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

    const processed = processor(value);
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

  const SingleAddModal = () => {
    if (!singleAddModal.open) return null;

    return createPortal(
      <div
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
            Quick Add One {singleAddModal.type.charAt(0).toUpperCase() + singleAddModal.type.slice(1)}
          </h3>

          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
            Enter the {singleAddModal.type} name:
          </p>

          <input
            type="text"
            dir="ltr"
            value={singleAddModal.value}
            onChange={(e) => setSingleAddModal({ ...singleAddModal, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSingleAdd();
              }
            }}
            placeholder={`Enter ${singleAddModal.type} name...`}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'Arial, sans-serif',
              marginBottom: '16px',
              boxSizing: 'border-box',
              direction: 'ltr',
              textAlign: 'left',
            }}
            autoFocus
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
                background: '#10b981',
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
              {isSaving && !isYTD && <span style={{ fontSize: '11px', color: '#f59e0b', marginLeft: '8px' }}>💾 Saving...</span>}
              {!isSaving && lastSaved && !isYTD && <span style={{ fontSize: '11px', color: '#10b981', marginLeft: '8px' }}>✓ Saved at {lastSaved}</span>}
              {isYTD && <span style={{ fontSize: '11px', color: '#475569', marginLeft: '8px' }}>YTD view • rows are read-only</span>}
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
            
            <input ref={jsonFileInputRef} type="file" accept=".json" onChange={handleImportCitiesJSON} style={{ display: 'none' }} />
            
            <input ref={jsonClientsInputRef} type="file" accept=".json" onChange={handleImportClientsJSON} style={{ display: 'none' }} />
            
            <button onClick={onClickImport} disabled={isImporting} style={{ padding: '8px 12px', background: isImporting ? '#9ca3af' : '#312e81', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: isImporting ? 'not-allowed' : 'pointer' }}>
              {isImporting ? '⏳ Importing…' : '⬆️ Import All (Excel)'}
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
                  <th style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {sortedShipments.length > 0 ? (
                  sortedShipments.map((shipment, idx) => {
                    const originalIndex = shipments.findIndex(s => s.id === shipment.id);
                    return (
                      <tr key={shipment.id} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'refNum', shipment.refNum)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'client', shipment.client || '')}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'shipDate', shipment.shipDate)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'returnDate', shipment.returnDate)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'location', shipment.location)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'returnLocation', shipment.returnLocation)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'city', shipment.city || '')}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'state', shipment.state || '')}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'company', shipment.company)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'shipMethod', shipment.shipMethod)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'vehicleType', shipment.vehicleType)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'shippingCharge', shipment.shippingCharge)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'po', shipment.po)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 0 }}>{renderCell(originalIndex, 'agent', shipment.agent)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteRow(originalIndex)}
                            disabled={isYTD}
                            style={{ color: isYTD ? '#94a3b8' : '#dc2626', background: 'none', border: 'none', cursor: isYTD ? 'not-allowed' : 'pointer', fontSize: '16px' }}
                            title={isYTD ? 'YTD view: delete disabled' : 'Delete'}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="15" style={{ border: '1px solid #cbd5e1', padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
                      No shipments for {selectedMonth}. {isYTD ? 'YTD aggregates all months.' : 'Click "Add Row" to start entering data.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '16px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', fontSize: '12px', color: '#64748b', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}>
            <p>
              <strong>Tips:</strong> {isYTD ? 'YTD rows are read-only • Use "Edit to month" + Add Row to add to a month • ' : ''}
              Click column headers to sort • Click any cell to edit • Press{' '}
              <kbd style={{ padding: '2px 6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px' }}>Enter</kbd>
              {' '}to move down • Press{' '}
              <kbd style={{ padding: '2px 6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px' }}>Tab</kbd>
              {' '}to move right • Press{' '}
              <kbd style={{ padding: '2px 6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px' }}>Esc</kbd>
              {' '}to cancel • Changes sync in real-time across all users
            </p>
          </div>
        </div>

        {/* STATS MOVED TO HERE - BELOW THE SHIPMENT DETAILS TABLE */}
        {statusEnabled && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px', marginBottom: '24px' }}>
              <div ref={costPerCompanyRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '12px', color: '#334155' }}>Shipping Cost Per Company</h3>
                {companySummary.length > 0 ? (
                  <table style={{ width: '100%', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: '600' }}>Company</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companySummary.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '4px' }}>{item.company}</td>
                          <td style={{ textAlign: 'right', padding: '4px' }}>
                            ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 'bold', borderTop: '2px solid #cbd5e1' }}>
                        <td style={{ padding: '4px' }}>Total</td>
                        <td style={{ textAlign: 'right', padding: '4px' }}>
                          ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No data for {selectedMonth}</p>
                )}
              </div>

              <div ref={shipmentCountRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Shipment Count by Company</h3>
                {companySummary.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {companySummary.map((item, idx) => (
                      <div key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
                          <span style={{ fontWeight: '600', color: '#475569' }}>{item.company}</span>
                          <span style={{ color: '#64748b' }}>{item.count} shipments</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '28px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${(item.count / maxCount) * 100}%`,
                                height: '100%',
                                background: chartColors[idx % chartColors.length],
                                borderRadius: '6px',
                                transition: 'width 0.3s ease',
                                boxShadow: `0 0 10px ${chartColors[idx % chartColors.length]}40`,
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155', minWidth: '30px', textAlign: 'right' }}>{item.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No data for {selectedMonth}</p>
                )}
              </div>
            </div>

            <div ref={revenueDistRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Revenue Distribution by Company</h3>
              {companySummary.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {companySummary.map((item, idx) => (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
                        <span style={{ fontWeight: '600', color: '#475569' }}>{item.company}</span>
                        <span style={{ color: '#64748b' }}>{totalCost > 0 ? ((item.total / totalCost) * 100).toFixed(1) : '0.0'}%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '32px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${totalCost > 0 ? (item.total / totalCost) * 100 : 0}%`,
                              height: '100%',
                              background: `linear-gradient(90deg, ${chartColors[idx % chartColors.length]}, ${chartColors[idx % chartColors.length]}dd)`,
                              display: 'flex',
                              alignItems: 'center',
                              paddingRight: '12px',
                              justifyContent: 'flex-end',
                              color: 'white',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              transition: 'width 0.5s ease',
                              borderRadius: '8px',
                            }}
                          >
                            ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
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























