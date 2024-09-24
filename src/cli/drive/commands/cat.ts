import { DepsTypes, DriveActions, DriveApi, DriveLookup } from "idrive-lib";

type Deps =
  & DriveLookup.Deps
  & DriveApi.DepApiMethod<"download">
  & DepsTypes.DepFetchClient;

export const cat = (
  { path }: { path: string },
): DriveLookup.Lookup<string, Deps> => {
  return DriveActions.cat({ path });
};
