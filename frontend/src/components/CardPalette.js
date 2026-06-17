import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { actions } from '../store';
import { listCollections } from '../services/api';

const CARD_TYPES = [
  { type: 'bar', label: 'Bar Chart', icon: '📊' },
  { type: 'line', label: 'Line Chart', icon: '📈' },
  { type: 'pie', label: 'Pie Chart', icon: '🥧' },
  { type: 'scalar', label: 'Metric', icon: '🔢' },
  { type: 'table', label: 'Table', icon: '📋' },
  { type: 'map', label: 'Map', icon: '🗺️' },
  { type: 'area', label: 'Area Chart', icon: '📉' },
  { type: 'row', label: 'Row Chart', icon: '📊' },
];

export default function CardPalette({ onAdd }) {
  const dispatch = useDispatch();
  const { collection, dashboard, groups } = useSelector(s => s.builder.config);
  
  const [collections, setCollections] = useState([]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTab, setNewTab] = useState('');
  const [newGroup, setNewGroup] = useState('');

  useEffect(() => {
    listCollections()
      .then(data => {
        const list = Array.isArray(data) ? data : (data.data || []);
        setCollections(list);
        
        if (!collection.name) {
          setIsCreatingNew(true);
        } else {
          const exists = list.some(c => c.name.toLowerCase() === collection.name.toLowerCase());
          if (!exists) {
            setIsCreatingNew(true);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load collections:', err);
        setIsCreatingNew(true);
      });
  }, [collection.name]);

  const handleCollectionChange = (val) => {
    if (val === '__new__') {
      setIsCreatingNew(true);
      dispatch(actions.setCollection({ name: '', description: '', parentId: null }));
    } else {
      setIsCreatingNew(false);
      const selected = collections.find(c => c.name === val);
      if (selected) {
        dispatch(actions.setCollection({
          name: selected.name,
          description: selected.description || '',
          parentId: selected.parent_id || selected.parentId || null
        }));
      } else {
        dispatch(actions.setCollection({ name: '', description: '', parentId: null }));
      }
    }
  };

  return (
    <div className="w-[250px] bg-white border-r border-slate-200 py-5 px-4 shrink-0 overflow-y-auto flex flex-col gap-5 box-border">
      {/* Collection Section */}
      <div className="border-b border-slate-100 pb-4">
        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">📁 Collection</div>
        <div className="mb-2.5">
          <label className="text-[11px] text-slate-600 block mb-1 font-semibold">Select Collection</label>
          <select
            className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:shadow-sm shadow-sm"
            value={isCreatingNew ? '__new__' : collection.name}
            onChange={e => handleCollectionChange(e.target.value)}
          >
            {!collection.name && <option value="">-- Select Collection --</option>}
            {collections.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
            {collection.name && !collections.some(c => c.name.toLowerCase() === collection.name.toLowerCase()) && (
              <option value={collection.name}>{collection.name}</option>
            )}
            <option value="__new__">+ New Collection</option>
          </select>
        </div>

        {isCreatingNew && (
          <>
            <div className="mb-2.5">
              <label className="text-[11px] text-slate-600 block mb-1 font-semibold">Collection Name</label>
              <input
                className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:shadow-sm shadow-sm"
                value={collection.name}
                placeholder="Type collection name..."
                onChange={e => dispatch(actions.setCollection({ name: e.target.value }))}
              />
            </div>
            <div className="mb-2.5">
              <label className="text-[11px] text-slate-600 block mb-1 font-semibold">Collection Description</label>
              <input
                className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:shadow-sm shadow-sm"
                value={collection.description}
                placeholder="Type collection description..."
                onChange={e => dispatch(actions.setCollection({ description: e.target.value }))}
              />
            </div>
          </>
        )}
      </div>

      {/* Dashboard Meta Section */}
      <div className="border-b border-slate-100 pb-4">
        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">📊 Dashboard Details</div>
        <div className="mb-2.5">
          <label className="text-[11px] text-slate-600 block mb-1 font-semibold">Dashboard Name</label>
          <input
            className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:shadow-sm shadow-sm"
            value={dashboard.name}
            placeholder="Dashboard name..."
            onChange={e => {
              dispatch(actions.setDashboardMeta({ name: e.target.value }));
              dispatch(actions.setMeta({ name: e.target.value })); // sync builder title
            }}
          />
        </div>
        <div className="mb-2.5">
          <label className="text-[11px] text-slate-600 block mb-1 font-semibold">Description</label>
          <input
            className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:shadow-sm shadow-sm"
            value={dashboard.description}
            placeholder="Dashboard description..."
            onChange={e => dispatch(actions.setDashboardMeta({ description: e.target.value }))}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer mt-1.5">
          <input
            type="checkbox"
            className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            checked={dashboard.pin}
            onChange={e => dispatch(actions.setDashboardMeta({ pin: e.target.checked }))}
          />
          <span>Pin to top</span>
        </label>
      </div>

            {/* Tabs Section */}
      <div className="border-b border-slate-100 pb-4">
        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">📑 Tabs</div>
        {(dashboard.tabs || []).map((tab, i) => (
          <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2.5 mb-1.5 text-xs font-semibold text-slate-700 border border-slate-200">
            <span>{tab.name}</span>
            <button
              className="ml-auto bg-transparent border-none cursor-pointer text-slate-400 text-sm transition-colors hover:text-red-500 p-0.5 rounded flex items-center justify-center"
              onClick={() => dispatch(actions.removeTab(i))}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex gap-1.5 mt-2.5">
          <input
            className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500"
            value={newTab}
            placeholder="Tab name"
            onChange={e => setNewTab(e.target.value)}
          />
          <button
            className="py-2 px-3 bg-indigo-600 text-white border-none rounded-lg cursor-pointer font-bold text-xs transition-all hover:bg-indigo-700"
            onClick={() => {
              if (newTab) {
                dispatch(actions.addTab(newTab));
                setNewTab('');
              }
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Card Palette / Add Chart Section */}
      <div className="border-b border-slate-100 pb-4">
        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">🧩 Add Chart Cards</div>
        <div className="grid grid-cols-2 gap-1.5">
          {CARD_TYPES.map(ct => (
            <div
              key={ct.type}
              className="flex flex-col items-center justify-center gap-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg cursor-grab text-[11px] font-semibold text-slate-600 transition-all hover:bg-slate-100 hover:border-slate-300 shadow-sm text-center"
              draggable
              onDragStart={e => e.dataTransfer.setData('cardType', ct.type)}
              onClick={() => onAdd({ type: ct.type, title: ct.label })}
            >
              <span className="text-lg">{ct.icon}</span>
              <span>{ct.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Groups Section */}
      <div className="pb-4">
        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">👥 Groups</div>
        {(groups || []).map((g, i) => (
          <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2.5 mb-1.5 text-xs font-semibold text-slate-700 border border-slate-200">
            <span>{g.name}</span>
            <button
              className="ml-auto bg-transparent border-none cursor-pointer text-slate-400 text-xs transition-colors hover:text-red-500 p-0.5 rounded flex items-center justify-center"
              onClick={() => dispatch(actions.removeGroup(i))}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex gap-1.5 mt-2.5">
          <input
            className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500"
            value={newGroup}
            placeholder="Group name"
            onChange={e => setNewGroup(e.target.value)}
          />
          <button
            className="py-2 px-3 bg-indigo-600 text-white border-none rounded-lg cursor-pointer font-bold text-xs transition-all hover:bg-indigo-700"
            onClick={() => {
              if (newGroup) {
                dispatch(actions.addGroup(newGroup));
                setNewGroup('');
              }
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
