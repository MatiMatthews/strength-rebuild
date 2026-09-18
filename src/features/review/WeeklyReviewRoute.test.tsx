import { render } from '@testing-library/react-native';
import WeeklyReviewRoute from '../../app/weekly-review';

const mockServices = {
  weeklyReviews: { listPendingWeeks: jest.fn().mockResolvedValue([]) },
  programs: {
    listCycleLifecycles: jest.fn().mockResolvedValue([{status:'ACTIVE',awaitingConfirmation:true}]),
    getTodayContext: jest.fn().mockRejectedValue(new Error('Unrelated next-workout snapshot unavailable')),
  },
};
jest.mock('expo-router',()=>({useRouter:()=>({replace:jest.fn()}),useIsFocused:()=>true}));
jest.mock('../../data/repositories/provider',()=>({useDataServices:()=>mockServices}));

it('shows durable review closure and cycle confirmation without loading unrelated future prescriptions',async()=>{
 const view=await render(<WeeklyReviewRoute />);
 expect(await view.findByText('Ciclo completado: confirmación pendiente')).toBeTruthy();
 expect(await view.findByText('No hay revisiones semanales pendientes. Vuelve a Hoy para consultar el siguiente paso.')).toBeTruthy();
 expect(view.queryByText('No se pudo cargar la revisión. Tus datos se conservan.')).toBeNull();
 expect(mockServices.programs.getTodayContext).not.toHaveBeenCalled();
});
