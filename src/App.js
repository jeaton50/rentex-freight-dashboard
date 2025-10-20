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
  const [shipments, setShipments] = useState([]);

  // NEW: City-to-State lookup from CSV
  const [cityStateMap, setCityStateMap] = useState(new Map());
  const [csvLoaded, setCsvLoaded] = useState(false);

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
  const fileInputRef = useRef(null);

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [statusEnabled, setStatusEnabled] = useState(true);

  const costPerCompanyRef = useRef(null);
  const clientStatsRef = useRef(null);
  const agentStatsRef = useRef(null);
  const shipmentCountRef = useRef(null);
  const revenueDistRef = useRef(null);
  const cityStatsRef = useRef(null);
  const stateStatsRef = useRef(null);

  // ==============================================================
  // NEW: Load CSV and build city-to-state lookup
  // ==============================================================
  useEffect(() => {
    const loadCityStateData = async () => {
      try {
        const response = await fetch('/us_cities_states_counties.csv');
        const text = await response.text();
        const lines = text.trim().split('\n');
        
        const cityMap = new Map();
        
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split('|');
          if (parts.length >= 2) {
            const city = parts[0]?.trim();
            const stateShort = parts[1]?.trim();
            
            if (city && stateShort) {
              if (!cityMap.has(city)) {
                cityMap.set(city, new Set());
              }
              cityMap.get(city).add(stateShort);
            }
          }
        }
        
        setCityStateMap(cityMap);
        setCsvLoaded(true);
        console.log(`Loaded ${cityMap.size} cities from CSV`);
      } catch (error) {
        console.error('Error loading city-state CSV:', error);
      }
    };

    loadCityStateData();
  }, []);

  // ==============================================================
  // Firebase Config & Auth Listener
  // ==============================================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsubscribe();
  }, []);

  // ==============================================================
  // Load shipments for selectedYear + selectedMonth
  // ==============================================================
  useEffect(() => {
    if (!isAuthenticated) return;
    if (isYTD) {
      loadYTDShipments(selectedYear);
    } else {
      const docRef = monthDocRef(selectedYear, selectedMonth);
      const unsubscribe = onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const d = docSnap.data();
            setShipments(d.shipments || []);
            setCompanies(d.companies || DEFAULT_COMPANIES);
            setLocations(d.locations || DEFAULT_LOCATIONS);
            setAgents(d.agents || DEFAULT_AGENTS);
            setCities(d.cities || DEFAULT_CITIES);
            setStates(d.states || DEFAULT_STATES);
            setClients(d.clients || []);
          } else {
            setShipments([]);
            setCompanies(DEFAULT_COMPANIES);
            setLocations(DEFAULT_LOCATIONS);
            setAgents(DEFAULT_AGENTS);
            setCities(DEFAULT_CITIES);
            setStates(DEFAULT_STATES);
            setClients([]);
          }
        },
        (error) => {
          console.error('Error listening to Firestore:', error);
        }
      );
      return () => unsubscribe();
    }
  }, [isAuthenticated, selectedYear, selectedMonth, isYTD]);

  const loadYTDShipments = async (year) => {
    const allShips = [];
    for (const m of MONTHS) {
      const docRef = monthDocRef(year, m);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        allShips.push(...(data.shipments || []));
      }
    }
    setShipments(allShips);
  };

  // ==============================================================
  // Autosave to Firestore (only when not YTD)
  // ==============================================================
  useEffect(() => {
    if (!isAuthenticated || isYTD) return;
    const timeoutId = setTimeout(() => {
      saveToFirestore();
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [shipments, companies, locations, agents, cities, states, clients]);

  const saveToFirestore = async () => {
    if (isYTD) return;
    setIsSaving(true);
    try {
      const docRef = monthDocRef(selectedYear, selectedMonth);
      await setDoc(docRef, {
        shipments,
        companies,
        locations,
        agents,
        cities,
        states,
        clients,
      }, { merge: true });
      setLastSaved(new Date());
    } catch (err) {
      console.error('Error saving to Firestore:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // ==============================================================
  // CRUD Shipment Rows
  // ==============================================================
  const addShipmentRow = () => {
    setShipments([
      ...shipments,
      {
        id: Date.now(),
        status: '',
        date: '',
        shipMethod: '',
        vehicleType: '',
        company: '',
        agent: '',
        origin: '',
        originCity: '',
        originState: '',
        destination: '',
        destCity: '',
        destState: '',
        cost: '',
        notes: '',
        Client: '',
        createdAt: new Date().toISOString(),
      }
    ]);
  };

  const deleteShipmentRow = (id) => {
    setShipments((prev) => prev.filter((s) => s.id !== id));
  };

  const duplicateShipmentRow = (id) => {
    const original = shipments.find((s) => s.id === id);
    if (!original) return;
    const newShip = {
      ...original,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    setShipments([...shipments, newShip]);
  };

  // ==============================================================
  // CELL EDITING with Enhanced Autocomplete
  // ==============================================================
  const startEditing = (rowId, colKey, currentValue) => {
    setEditingCell({ rowId, colKey });
    setEditValue(currentValue || '');
    setShowDropdown(false);
    setFilteredOptions([]);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setEditValue(val);

    const { colKey } = editingCell;
    const isAutocompleteField = [
      'company', 'agent', 'origin', 'destination',
      'originCity', 'destCity', 'originState', 'destState',
      'vehicleType', 'shipMethod', 'Client'
    ].includes(colKey);

    if (!isAutocompleteField) {
      setShowDropdown(false);
      return;
    }

    let pool = [];
    if (colKey === 'company') pool = companies;
    else if (colKey === 'agent') pool = agents;
    else if (colKey === 'origin') pool = locations;
    else if (colKey === 'destination') pool = locations;
    else if (colKey === 'originCity') pool = cities;
    else if (colKey === 'destCity') pool = cities;
    else if (colKey === 'originState') pool = states;
    else if (colKey === 'destState') pool = states;
    else if (colKey === 'vehicleType') pool = VEHICLE_TYPES;
    else if (colKey === 'shipMethod') pool = SHIP_METHODS;
    else if (colKey === 'Client') pool = clients;

    if (val.trim().length === 0) {
      setFilteredOptions([...pool].slice(0, 10));
      setShowDropdown(true);
    } else {
      const lowerVal = val.toLowerCase();
      
      // NEW: Enhanced filtering for city fields with state info
      if ((colKey === 'originCity' || colKey === 'destCity') && csvLoaded) {
        const matches = pool
          .filter((opt) => opt.toLowerCase().includes(lowerVal))
          .slice(0, 15)
          .map((city) => {
            const stateSet = cityStateMap.get(city);
            if (stateSet && stateSet.size > 0) {
              const statesStr = Array.from(stateSet).sort().join(', ');
              return { city, states: statesStr };
            }
            return { city, states: null };
          });
        setFilteredOptions(matches);
        setShowDropdown(matches.length > 0);
      } else {
        const matches = pool.filter((opt) => opt.toLowerCase().includes(lowerVal)).slice(0, 10);
        setFilteredOptions(matches);
        setShowDropdown(matches.length > 0);
      }
    }
  };

  const selectOption = (option) => {
    const { rowId, colKey } = editingCell;
    
    // Extract city name if it's a city field with enhanced format
    let valueToSet = option;
    let stateToSet = null;
    
    if ((colKey === 'originCity' || colKey === 'destCity') && typeof option === 'object') {
      valueToSet = option.city;
      // Auto-fill state if there's only one state for this city
      const stateSet = cityStateMap.get(option.city);
      if (stateSet && stateSet.size === 1) {
        stateToSet = Array.from(stateSet)[0];
      }
    }
    
    setShipments((prev) =>
      prev.map((s) => {
        if (s.id === rowId) {
          const updated = { ...s, [colKey]: valueToSet };
          
          // Auto-fill corresponding state field
          if (colKey === 'originCity' && stateToSet) {
            updated.originState = stateToSet;
          } else if (colKey === 'destCity' && stateToSet) {
            updated.destState = stateToSet;
          }
          
          return updated;
        }
        return s;
      })
    );
    
    setEditValue(valueToSet);
    setShowDropdown(false);
    setFilteredOptions([]);
    
    // Auto-add to the pool if not present
    if (colKey === 'company' && !companies.includes(valueToSet)) {
      setCompanies([...companies, valueToSet]);
    } else if (colKey === 'agent' && !agents.includes(valueToSet)) {
      setAgents([...agents, valueToSet]);
    } else if ((colKey === 'origin' || colKey === 'destination') && !locations.includes(valueToSet)) {
      setLocations([...locations, valueToSet]);
    } else if ((colKey === 'originCity' || colKey === 'destCity') && !cities.includes(valueToSet)) {
      setCities([...cities, valueToSet]);
    } else if ((colKey === 'originState' || colKey === 'destState') && !states.includes(valueToSet)) {
      setStates([...states, valueToSet]);
    } else if (colKey === 'Client' && !clients.includes(valueToSet)) {
      setClients([...clients, valueToSet]);
    }
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const { rowId, colKey } = editingCell;
    let finalValue = editValue;

    if (colKey === 'cost') {
      const num = parseFloat(finalValue);
      finalValue = isNaN(num) ? '' : String(num);
    }

    setShipments((prev) =>
      prev.map((s) => (s.id === rowId ? { ...s, [colKey]: finalValue } : s))
    );

    // Auto-add values to respective pools
    if (colKey === 'company' && finalValue && !companies.includes(finalValue)) {
      setCompanies([...companies, finalValue]);
    } else if (colKey === 'agent' && finalValue && !agents.includes(finalValue)) {
      setAgents([...agents, finalValue]);
    } else if ((colKey === 'origin' || colKey === 'destination') && finalValue && !locations.includes(finalValue)) {
      setLocations([...locations, finalValue]);
    } else if ((colKey === 'originCity' || colKey === 'destCity') && finalValue && !cities.includes(finalValue)) {
      setCities([...cities, finalValue]);
    } else if ((colKey === 'originState' || colKey === 'destState') && finalValue && !states.includes(finalValue)) {
      setStates([...states, finalValue]);
    } else if (colKey === 'Client' && finalValue && !clients.includes(finalValue)) {
      setClients([...clients, finalValue]);
    }

    setEditingCell(null);
    setEditValue('');
    setShowDropdown(false);
    setFilteredOptions([]);
  };

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownRect(rect);
    }
  }, [editingCell]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        if (editingCell) commitEdit();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingCell, editValue]);

  // ==============================================================
  // BULK ADD
  // ==============================================================
  const openBulkAdd = (type) => {
    setBulkAddModal({ open: true, type, items: '' });
  };

  const closeBulkAdd = () => {
    setBulkAddModal({ open: false, type: '', items: '' });
  };

  const handleBulkAdd = () => {
    const { type, items } = bulkAddModal;
    const newItems = items.split('\n').map((line) => line.trim()).filter(Boolean);
    if (type === 'companies') {
      setCompanies((prev) => [...new Set([...prev, ...newItems])]);
    } else if (type === 'locations') {
      setLocations((prev) => [...new Set([...prev, ...newItems])]);
    } else if (type === 'agents') {
      setAgents((prev) => [...new Set([...prev, ...newItems])]);
    } else if (type === 'cities') {
      setCities((prev) => [...new Set([...prev, ...newItems])]);
    } else if (type === 'states') {
      setStates((prev) => [...new Set([...prev, ...newItems])]);
    } else if (type === 'clients') {
      setClients((prev) => [...new Set([...prev, ...newItems])]);
    }
    closeBulkAdd();
  };

  const BulkAddModal = () => {
    if (!bulkAddModal.open) return null;
    return createPortal(
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}
        onClick={closeBulkAdd}
      >
        <div
          style={{
            background: 'white', borderRadius: '8px', padding: '24px',
            minWidth: '400px', maxWidth: '500px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '16px' }}>
            Bulk Add {bulkAddModal.type}
          </h3>
          <p style={{ marginBottom: '12px', fontSize: '14px', color: '#64748b' }}>
            Enter one {bulkAddModal.type.slice(0, -1)} per line:
          </p>
          <textarea
            style={{
              width: '100%', minHeight: '200px', padding: '8px',
              border: '1px solid #cbd5e1', borderRadius: '4px',
              fontSize: '14px', fontFamily: 'inherit'
            }}
            value={bulkAddModal.items}
            onChange={(e) =>
              setBulkAddModal({ ...bulkAddModal, items: e.target.value })
            }
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button
              style={{
                flex: 1, padding: '8px', background: '#10b981',
                color: 'white', border: 'none', borderRadius: '4px',
                cursor: 'pointer', fontWeight: '500'
              }}
              onClick={handleBulkAdd}
            >
              Add
            </button>
            <button
              style={{
                flex: 1, padding: '8px', background: '#e2e8f0',
                color: '#334155', border: 'none', borderRadius: '4px',
                cursor: 'pointer', fontWeight: '500'
              }}
              onClick={closeBulkAdd}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ==============================================================
  // EXPORT TO EXCEL
  // ==============================================================
  const exportToExcel = async () => {
    if (!shipments || shipments.length === 0) {
      alert('No shipments to export.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${selectedMonth} ${selectedYear}`);

    const columns = [
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Ship Method', key: 'shipMethod', width: 20 },
      { header: 'Vehicle Type', key: 'vehicleType', width: 15 },
      { header: 'Company', key: 'company', width: 20 },
      { header: 'Agent', key: 'agent', width: 15 },
      { header: 'Origin', key: 'origin', width: 25 },
      { header: 'Origin City', key: 'originCity', width: 15 },
      { header: 'Origin State', key: 'originState', width: 12 },
      { header: 'Destination', key: 'destination', width: 25 },
      { header: 'Dest City', key: 'destCity', width: 15 },
      { header: 'Dest State', key: 'destState', width: 12 },
      { header: 'Cost', key: 'cost', width: 12 },
      { header: 'Client', key: 'Client', width: 20 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];

    worksheet.columns = columns;

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    shipments.forEach((s) => {
      worksheet.addRow({
        status: s.status || '',
        date: s.date || '',
        shipMethod: s.shipMethod || '',
        vehicleType: s.vehicleType || '',
        company: s.company || '',
        agent: s.agent || '',
        origin: s.origin || '',
        originCity: s.originCity || '',
        originState: s.originState || '',
        destination: s.destination || '',
        destCity: s.destCity || '',
        destState: s.destState || '',
        cost: s.cost || '',
        Client: s.Client || '',
        notes: s.notes || '',
      });
    });

    autosizeColumns(worksheet);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedMonth}_${selectedYear}_Shipments.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ==============================================================
  // IMPORT FROM EXCEL
  // ==============================================================
  const importFromExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const sheet = workbook.worksheets[0];
      if (!sheet) {
        alert('No worksheet found in this file.');
        return;
      }

      const colMap = {};
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell, colNum) => {
        const val = cell.text?.trim()?.toLowerCase();
        if (!val) return;
        if (val.includes('status')) colMap.status = colNum;
        else if (val.includes('date')) colMap.date = colNum;
        else if (val.includes('ship') && val.includes('method')) colMap.shipMethod = colNum;
        else if (val.includes('vehicle')) colMap.vehicleType = colNum;
        else if (val.includes('company')) colMap.company = colNum;
        else if (val.includes('agent')) colMap.agent = colNum;
        else if (val.includes('origin') && !val.includes('city') && !val.includes('state')) colMap.origin = colNum;
        else if (val.includes('origin') && val.includes('city')) colMap.originCity = colNum;
        else if (val.includes('origin') && val.includes('state')) colMap.originState = colNum;
        else if (val.includes('destination') && !val.includes('city') && !val.includes('state')) colMap.destination = colNum;
        else if (val.includes('dest') && val.includes('city')) colMap.destCity = colNum;
        else if (val.includes('dest') && val.includes('state')) colMap.destState = colNum;
        else if (val.includes('cost')) colMap.cost = colNum;
        else if (val.includes('client')) colMap.Client = colNum;
        else if (val.includes('note')) colMap.notes = colNum;
      });

      const imported = [];
      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;

        const getVal = (key) => {
          if (!colMap[key]) return '';
          const cell = row.getCell(colMap[key]);
          let val = cell.value;

          if (val === null || val === undefined) return '';
          if (typeof val === 'object') {
            if (val.result !== undefined) val = val.result;
            else if (val.text !== undefined) val = val.text;
            else if (val.richText && Array.isArray(val.richText)) {
              val = val.richText.map((rt) => rt.text).join('');
            } else if (val instanceof Date) {
              val = toISODateUTC(val);
            } else {
              val = '';
            }
          }

          return String(val).trim();
        };

        let dateVal = getVal('date');
        if (dateVal && !isNaN(Number(dateVal))) {
          const d = excelSerialToDateUTC(parseFloat(dateVal));
          dateVal = toISODateUTC(d);
        }

        const newRow = {
          id: Date.now() + Math.random(),
          status: getVal('status'),
          date: dateVal,
          shipMethod: getVal('shipMethod'),
          vehicleType: getVal('vehicleType'),
          company: getVal('company'),
          agent: getVal('agent'),
          origin: getVal('origin'),
          originCity: getVal('originCity'),
          originState: getVal('originState'),
          destination: getVal('destination'),
          destCity: getVal('destCity'),
          destState: getVal('destState'),
          cost: getVal('cost'),
          Client: getVal('Client'),
          notes: getVal('notes'),
          createdAt: new Date().toISOString(),
        };

        const hasData = Object.values(newRow).some((v) => v && v !== '');
        if (hasData) imported.push(newRow);
      });

      if (imported.length === 0) {
        alert('No valid data rows found.');
        return;
      }

      const newCompanies = new Set(companies);
      const newAgents = new Set(agents);
      const newLocations = new Set(locations);
      const newCities = new Set(cities);
      const newStates = new Set(states);
      const newClients = new Set(clients);

      imported.forEach((row) => {
        if (row.company) newCompanies.add(row.company);
        if (row.agent) newAgents.add(row.agent);
        if (row.origin) newLocations.add(row.origin);
        if (row.destination) newLocations.add(row.destination);
        if (row.originCity) newCities.add(row.originCity);
        if (row.destCity) newCities.add(row.destCity);
        if (row.originState) newStates.add(row.originState);
        if (row.destState) newStates.add(row.destState);
        if (row.Client) newClients.add(row.Client);
      });

      setCompanies(Array.from(newCompanies));
      setAgents(Array.from(newAgents));
      setLocations(Array.from(newLocations));
      setCities(Array.from(newCities));
      setStates(Array.from(newStates));
      setClients(Array.from(newClients));

      setShipments((prev) => [...prev, ...imported]);
      alert(`Imported ${imported.length} rows.`);
    } catch (err) {
      console.error('Import error:', err);
      alert('Failed to import. Please ensure the file is a valid Excel file.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ==============================================================
  // SORTING
  // ==============================================================
  const handleSort = (key) => {
    let dir = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      dir = 'desc';
    }
    setSortConfig({ key, direction: dir });
  };

  const sortedShipments = [...shipments].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const valA = a[sortConfig.key] || '';
    const valB = b[sortConfig.key] || '';

    if (sortConfig.key === 'cost') {
      const numA = parseFloat(valA) || 0;
      const numB = parseFloat(valB) || 0;
      return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
    }

    if (sortConfig.key === 'date') {
      const dA = valA ? new Date(valA).getTime() : 0;
      const dB = valB ? new Date(valB).getTime() : 0;
      return sortConfig.direction === 'asc' ? dA - dB : dB - dA;
    }

    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // ==============================================================
  // ANALYTICS
  // ==============================================================
  const totalCost = sortedShipments.reduce((sum, s) => {
    const c = parseFloat(s.cost);
    return sum + (isNaN(c) ? 0 : c);
  }, 0);

  const openAnalytics = () => setShowAnalytics(true);
  const closeAnalytics = () => setShowAnalytics(false);

  const copyMonthTarget = async () => {
    if (isYTD) return;
    const sourceDoc = monthDocRef(selectedYear, editTargetMonth);
    const targetDoc = monthDocRef(selectedYear, selectedMonth);

    try {
      const snap = await getDoc(sourceDoc);
      if (!snap.exists()) {
        alert(`No data found for ${editTargetMonth}.`);
        return;
      }
      const data = snap.data();
      await setDoc(targetDoc, data, { merge: true });

      setShipments(data.shipments || []);
      setCompanies(data.companies || DEFAULT_COMPANIES);
      setLocations(data.locations || DEFAULT_LOCATIONS);
      setAgents(data.agents || DEFAULT_AGENTS);
      setCities(data.cities || DEFAULT_CITIES);
      setStates(data.states || DEFAULT_STATES);
      setClients(data.clients || []);

      alert(`Copied data from ${editTargetMonth} to ${selectedMonth}.`);
    } catch (err) {
      console.error('Copy error:', err);
      alert('Failed to copy month data.');
    }
  };

  const clearAllShipments = async () => {
    if (!window.confirm('Clear ALL shipments in this month? This cannot be undone.')) return;
    setShipments([]);
  };

  const chartColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  ];

  const costByCompany = {};
  const countByAgent = {};
  const countByCity = {};
  const countByState = {};

  sortedShipments.forEach((s) => {
    const c = parseFloat(s.cost) || 0;
    const company = s.company || 'Unknown';
    const agent = s.agent || 'Unknown';
    const city = s.originCity || 'Unknown';
    const state = s.originState || 'Unknown';

    costByCompany[company] = (costByCompany[company] || 0) + c;
    countByAgent[agent] = (countByAgent[agent] || 0) + 1;
    countByCity[city] = (countByCity[city] || 0) + 1;
    countByState[state] = (countByState[state] || 0) + 1;
  });

  const companySummary = Object.entries(costByCompany)
    .map(([company, total]) => ({ company, total }))
    .sort((a, b) => b.total - a.total);

  const agentSummary = Object.entries(countByAgent)
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count);

  const citySummary = Object.entries(countByCity)
    .map(([city, count]) => {
      const total = sortedShipments
        .filter((s) => (s.originCity || 'Unknown') === city)
        .reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);
      return { city, count, total };
    })
    .sort((a, b) => b.count - a.count);

  const stateSummary = Object.entries(countByState)
    .map(([state, count]) => {
      const total = sortedShipments
        .filter((s) => (s.originState || 'Unknown') === state)
        .reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);
      return { state, count, total };
    })
    .sort((a, b) => b.count - a.count);

  const maxCompanyCost = Math.max(...companySummary.map((i) => i.total), 1);
  const maxAgentCount = Math.max(...agentSummary.map((i) => i.count), 1);
  const maxCityCount = Math.max(...citySummary.map((i) => i.count), 1);
  const maxStateCount = Math.max(...stateSummary.map((i) => i.count), 1);

  const exportSummaryPng = async () => {
    const container = document.createElement('div');
    container.style.background = 'white';
    container.style.padding = '20px';
    container.style.width = '1200px';

    const header = document.createElement('div');
    header.innerHTML = `<h2 style="margin:0 0 16px 0;">Analytics Summary - ${selectedMonth} ${selectedYear}</h2>`;
    container.appendChild(header);

    const clone = (ref, title) => {
      const section = document.createElement('div');
      section.style.marginBottom = '20px';
      const h = document.createElement('h3');
      h.textContent = title;
      h.style.margin = '8px 0';
      section.appendChild(h);
      if (ref.current) {
        const clonedNode = ref.current.cloneNode(true);
        section.appendChild(clonedNode);
      }
      container.appendChild(section);
    };

    clone(costPerCompanyRef, 'Cost per Company');
    clone(agentStatsRef, 'Agent Stats');
    clone(cityStatsRef, 'City Stats');
    clone(stateStatsRef, 'State Stats');

    document.body.appendChild(container);
    container.style.position = 'absolute';
    container.style.top = '-9999px';

    try {
      const dataUrl = await toPng(container, { quality: 0.95, pixelRatio: 2 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${selectedMonth}_${selectedYear}_Analytics.png`;
      link.click();
    } catch (err) {
      console.error('Export PNG error:', err);
      alert('Failed to export PNG.');
    } finally {
      document.body.removeChild(container);
    }
  };

  // ==============================================================
  // RENDER
  // ==============================================================
  if (!isAuthenticated) {
    return <PasswordLogin />;
  }

  const DropdownPortal = ({ children }) => {
    if (!showDropdown || !dropdownRect) return null;
    return createPortal(
      <div
        style={{
          position: 'fixed',
          top: dropdownRect.bottom + window.scrollY,
          left: dropdownRect.left + window.scrollX,
          width: dropdownRect.width,
          maxHeight: '200px',
          overflowY: 'auto',
          background: 'white',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 9999,
        }}
      >
        {children}
      </div>,
      document.body
    );
  };

  return (
    <div style={{ padding: '16px', maxWidth: '100%', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header with CSV Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>
            Freight Analytics Dashboard
          </h1>
          {csvLoaded && (
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#10b981' }}>
              ✓ City-State database loaded ({cityStateMap.size} cities)
            </p>
          )}
        </div>
        <button
          onClick={() => signOut(auth)}
          style={{
            padding: '8px 16px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          Logout
        </button>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px', display: 'block' }}>Year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{
              padding: '8px',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px', display: 'block' }}>Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              padding: '8px',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          >
            {MONTHS_WITH_YTD.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {!isYTD && (
          <>
            <div>
              <label style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px', display: 'block' }}>
                Copy From
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  value={editTargetMonth}
                  onChange={(e) => setEditTargetMonth(e.target.value)}
                  style={{
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  onClick={copyMonthTarget}
                  style={{
                    padding: '8px 12px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button
            onClick={() => openBulkAdd('companies')}
            style={{
              padding: '8px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + Companies
          </button>
          <button
            onClick={() => openBulkAdd('locations')}
            style={{
              padding: '8px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + Locations
          </button>
          <button
            onClick={() => openBulkAdd('agents')}
            style={{
              padding: '8px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + Agents
          </button>
          <button
            onClick={() => openBulkAdd('cities')}
            style={{
              padding: '8px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + Cities
          </button>
          <button
            onClick={() => openBulkAdd('states')}
            style={{
              padding: '8px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + States
          </button>
          <button
            onClick={() => openBulkAdd('clients')}
            style={{
              padding: '8px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + Clients
          </button>
          <button
            onClick={exportToExcel}
            style={{
              padding: '8px 12px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Export Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={importFromExcel}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            style={{
              padding: '8px 12px',
              background: isImporting ? '#94a3b8' : '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isImporting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            {isImporting ? 'Importing...' : 'Import Excel'}
          </button>
          <button
            onClick={openAnalytics}
            style={{
              padding: '8px 12px',
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            View Analytics
          </button>
          {!isYTD && (
            <button
              onClick={clearAllShipments}
              style={{
                padding: '8px 12px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Status & Save Info */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '14px', color: '#64748b' }}>
        {!isYTD && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              checked={statusEnabled}
              onChange={(e) => setStatusEnabled(e.target.checked)}
            />
            Enable Status Column
          </label>
        )}
        {isSaving && <span>Saving...</span>}
        {!isYTD && lastSaved && (
          <span>Last saved: {lastSaved.toLocaleTimeString()}</span>
        )}
      </div>

      {/* Table */}
      {!isYTD && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={addShipmentRow}
              style={{
                padding: '8px 16px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              + Add Shipment
            </button>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px', background: 'white' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid #cbd5e1' }}>
                    Actions
                  </th>
                  {statusEnabled && (
                    <th
                      onClick={() => handleSort('status')}
                      style={{
                        padding: '10px',
                        textAlign: 'left',
                        fontWeight: '600',
                        borderBottom: '1px solid #cbd5e1',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                  )}
                  <th
                    onClick={() => handleSort('date')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('shipMethod')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Ship Method {sortConfig.key === 'shipMethod' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('vehicleType')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Vehicle {sortConfig.key === 'vehicleType' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('company')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Company {sortConfig.key === 'company' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('agent')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Agent {sortConfig.key === 'agent' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('origin')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Origin {sortConfig.key === 'origin' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('originCity')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Origin City {sortConfig.key === 'originCity' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('originState')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Origin State {sortConfig.key === 'originState' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('destination')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Destination {sortConfig.key === 'destination' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('destCity')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Dest City {sortConfig.key === 'destCity' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('destState')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Dest State {sortConfig.key === 'destState' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('cost')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Cost {sortConfig.key === 'cost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('Client')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Client {sortConfig.key === 'Client' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('notes')}
                    style={{
                      padding: '10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      borderBottom: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Notes {sortConfig.key === 'notes' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedShipments.map((shipment, idx) => (
                  <tr
                    key={shipment.id}
                    style={{
                      background: idx % 2 === 0 ? 'white' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => deleteShipmentRow(shipment.id)}
                        style={{
                          padding: '4px 8px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          marginRight: '4px',
                        }}
                      >
                        Del
                      </button>
                      <button
                        onClick={() => duplicateShipmentRow(shipment.id)}
                        style={{
                          padding: '4px 8px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Dup
                      </button>
                    </td>
                    {statusEnabled && (
                      <td
                        onClick={() => startEditing(shipment.id, 'status', shipment.status)}
                        style={{ padding: '8px', cursor: 'text', minWidth: '80px' }}
                      >
                        {editingCell?.rowId === shipment.id && editingCell?.colKey === 'status' ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                        ) : (
                          shipment.status || ''
                        )}
                      </td>
                    )}
                    <td
                      onClick={() => startEditing(shipment.id, 'date', shipment.date)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '100px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'date' ? (
                        <input
                          ref={inputRef}
                          type="date"
                          value={editValue}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              commitEdit();
                            } else if (e.key === 'Escape') {
                              setEditingCell(null);
                              setEditValue('');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '4px',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            fontSize: '13px',
                          }}
                        />
                      ) : (
                        shipment.date || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'shipMethod', shipment.shipMethod)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '120px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'shipMethod' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {opt}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.shipMethod || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'vehicleType', shipment.vehicleType)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '100px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'vehicleType' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {opt}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.vehicleType || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'company', shipment.company)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '120px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'company' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {opt}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.company || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'agent', shipment.agent)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '100px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'agent' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {opt}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.agent || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'origin', shipment.origin)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '150px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'origin' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {opt}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.origin || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'originCity', shipment.originCity)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '120px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'originCity' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {typeof opt === 'object' ? (
                                  <div>
                                    <div style={{ fontWeight: '500' }}>{opt.city}</div>
                                    {opt.states && (
                                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                                        {opt.states}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  opt
                                )}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.originCity || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'originState', shipment.originState)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '80px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'originState' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {opt}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.originState || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'destination', shipment.destination)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '150px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'destination' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {opt}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.destination || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'destCity', shipment.destCity)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '120px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'destCity' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {typeof opt === 'object' ? (
                                  <div>
                                    <div style={{ fontWeight: '500' }}>{opt.city}</div>
                                    {opt.states && (
                                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                                        {opt.states}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  opt
                                )}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.destCity || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'destState', shipment.destState)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '80px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'destState' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {opt}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.destState || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'cost', shipment.cost)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '80px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'cost' ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              commitEdit();
                            } else if (e.key === 'Escape') {
                              setEditingCell(null);
                              setEditValue('');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '4px',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            fontSize: '13px',
                          }}
                        />
                      ) : (
                        shipment.cost || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'Client', shipment.Client)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '120px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'Client' ? (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitEdit();
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditValue('');
                                setShowDropdown(false);
                              } else if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
                                e.preventDefault();
                                const btn = document.querySelector('.dropdown-option');
                                if (btn) btn.focus();
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '13px',
                            }}
                          />
                          <DropdownPortal>
                            {filteredOptions.map((opt, i) => (
                              <button
                                key={i}
                                className="dropdown-option"
                                onClick={() => selectOption(opt)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {opt}
                              </button>
                            ))}
                          </DropdownPortal>
                        </>
                      ) : (
                        shipment.Client || ''
                      )}
                    </td>
                    <td
                      onClick={() => startEditing(shipment.id, 'notes', shipment.notes)}
                      style={{ padding: '8px', cursor: 'text', minWidth: '150px' }}
                    >
                      {editingCell?.rowId === shipment.id && editingCell?.colKey === 'notes' ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              commitEdit();
                            } else if (e.key === 'Escape') {
                              setEditingCell(null);
                              setEditValue('');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '4px',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            fontSize: '13px',
                          }}
                        />
                      ) : (
                        shipment.notes || ''
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '4px' }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
              Total Shipments: {sortedShipments.length} | Total Cost: $
              {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </>
      )}

      {/* YTD View */}
      {isYTD && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Year-to-Date Summary</h2>
          <div ref={costPerCompanyRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Cost per Company</h3>
            {companySummary.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <table style={{ width: '100%', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: '600' }}>Company</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companySummary.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                          <td style={{ padding: '4px' }}>{item.company}</td>
                          <td style={{ textAlign: 'right', padding: '4px' }}>
                            ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
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
                                width: `${(item.total / maxCompanyCost) * 100}%`,
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
              <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>No company data for {selectedMonth}</p>
            )}
          </div>

          <div ref={agentStatsRef} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', color: '#334155' }}>Agent Statistics</h3>
            {agentSummary.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <table style={{ width: '100%', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: '600' }}>Agent</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: '600' }}>Shipments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentSummary.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                          <td style={{ padding: '4px' }}>{item.agent}</td>
                          <td style={{ textAlign: 'right', padding: '4px' }}>{item.count}</td>
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
        </div>
      )}
      <BulkAddModal />
    </div>
  );
}

export default App;





