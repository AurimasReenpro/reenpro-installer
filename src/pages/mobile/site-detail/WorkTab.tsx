import React from 'react';
import SignedPhoto from '../../../components/ui/SignedPhoto';
import type { SiteChecklist, SitePhoto } from '../../../types/site.types';
import { Check, Loader2, Camera } from 'lucide-react';

interface WorkTabProps {
  checklists: SiteChecklist[];
  photos: SitePhoto[];
  compressingCheckId: string | null;
  uploadingCheckId: string | null;
  onToggleChecklist: (checkId: string, currentStatus: boolean) => void;
  onUploadPhoto: (e: React.ChangeEvent<HTMLInputElement>, checkId: string) => void;
  onSelectPhoto: (photo: SitePhoto, checkId: string) => void;
}

export default function WorkTab({
  checklists,
  photos,
  compressingCheckId,
  uploadingCheckId,
  onToggleChecklist,
  onUploadPhoto,
  onSelectPhoto
}: WorkTabProps) {
  return (
    <div className="px-4 pb-[120px] pt-4">
      {['pre', 'during', 'post'].map((phaseCode) => {
        const phaseItems = checklists?.filter((c) => c.phase === phaseCode) || [];
        if (phaseItems.length === 0) return null;
        
        let phaseTitle = 'Darbų eiga';
        if (phaseCode === 'pre') phaseTitle = 'Pasiruošimas (Pre-checklist)';
        if (phaseCode === 'post') phaseTitle = 'Užbaigimas (Post-checklist)';

        return (
          <div key={phaseCode} className="mb-6">
            <h3 className="text-on-surface font-bold mb-3">{phaseTitle}</h3>
            {phaseItems.map((item) => (
              <div 
                key={item.id} 
                className="bg-white rounded-xl p-4 shadow-sm mb-3 flex items-center justify-between border border-outline-variant/30"
              >
                <div className="flex items-center flex-1 cursor-pointer" onClick={() => { void onToggleChecklist(item.id, !!item.is_completed); }}>
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                    item.is_completed ? 'bg-[#10B981] border-[#10B981]' : 'border-outline-variant/50 bg-white'
                  }`}>
                    {item.is_completed && <Check className="text-white w-4 h-4 stroke-[3]" />}
                  </div>
                  <span className={`text-[#1d033a] font-semibold text-sm ml-3 leading-snug ${item.is_completed ? 'opacity-60 line-through' : ''}`}>
                    {item.task_name}
                  </span>
                </div>
                {item.requires_photo && (
                  <div className="relative ml-3 flex-shrink-0">
                    {compressingCheckId === item.id ? (
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 className="text-[#8052b2] animate-spin w-5 h-5" />
                        <span className="text-[9px] text-[#8052b2] font-semibold mt-0.5 leading-none">Spaudžiama...</span>
                      </div>
                    ) : uploadingCheckId === item.id ? (
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 className="text-[#8052b2] animate-spin w-5 h-5" />
                        <span className="text-[9px] text-[#8052b2] font-semibold mt-0.5 leading-none">Keliama...</span>
                      </div>
                    ) : photos?.some((p) => p.checklist_id === item.id) ? (
                      <SignedPhoto
                        storage_path={photos.find((p) => p.checklist_id === item.id)!.storage_path}
                        alt="Atlikta užduotis"
                        className="w-10 h-10 rounded-md object-cover border border-[#cdc3d4] cursor-pointer"
                        onClick={() => onSelectPhoto(
                          photos.find((p) => p.checklist_id === item.id)!, 
                          item.id
                        )}
                      />
                    ) : (
                      <label 
                        className="cursor-pointer flex items-center justify-center w-9 h-9 rounded-full bg-[#f6e9ff] active:bg-[#e4cbf8] transition-colors"
                      >
                        <Camera className="text-[#8052b2] w-5 h-5" />
                        <input 
                          type="file" 
                          accept="image/*" 
                          capture="environment" 
                          className="hidden" 
                          onChange={(e) => { void onUploadPhoto(e, item.id); }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
      
      {(!checklists || checklists.length === 0) && (
        <div className="text-center text-on-surface-variant py-8 bg-white rounded-xl shadow-sm border border-outline-variant/30">
          Užduočių nėra.
        </div>
      )}
    </div>
  );
}
