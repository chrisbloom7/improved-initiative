import { CurrentSettings } from "../Settings/Settings";
import { Combatant } from "./Combatant";
import { Tag } from "./Tag";

export interface StaticCombatantViewModel {
    Name: string;
    AC: number;
    ACDisplay: boolean;
    HPDisplay: string;
    HPColor: string;
    Initiative: number;
    Id: string;
    Tags: Tag[];
    IsPlayerCharacter: boolean;
}

export function ToStaticViewModel(combatant: Combatant): StaticCombatantViewModel {
    return {
        Name: combatant.DisplayName(),
        AC: combatant.AC,
        Id: combatant.Id,
        ACDisplay: GetACDisplay(combatant),
        HPDisplay: GetHPDisplay(combatant),
        HPColor: GetHPColor(combatant),
        Initiative: combatant.Initiative(),
        IsPlayerCharacter: combatant.IsPlayerCharacter,
        Tags: combatant.Tags(),
    };
}

function GetACDisplay(combatant: Combatant): boolean {
    return combatant.IsPlayerCharacter || !combatant.HideAC()
}

function GetHPDisplay(combatant: Combatant): string {
    let monsterHpVerbosity = CurrentSettings().PlayerView.MonsterHPVerbosity;

    if (combatant.IsPlayerCharacter || monsterHpVerbosity == "Actual HP") {
        if (combatant.TemporaryHP()) {
            return `${combatant.CurrentHP()}+${combatant.TemporaryHP()}/${combatant.MaxHP}`;
        } else {
            return `${combatant.CurrentHP()}/${combatant.MaxHP}`;
        }
    }

    if (monsterHpVerbosity == "Hide All") {
        return "";
    }

    if (monsterHpVerbosity == "Damage Taken") {
        return (combatant.CurrentHP() - combatant.MaxHP).toString();
    }

    if (combatant.CurrentHP() <= 0) {
        return "<span class='defeatedHP'>Defeated</span>";
    } else if (combatant.CurrentHP() < combatant.MaxHP / 2) {
        return "<span class='bloodiedHP'>Bloodied</span>";
    } else if (combatant.CurrentHP() < combatant.MaxHP) {
        return "<span class='hurtHP'>Hurt</span>";
    }
    return "<span class='healthyHP'>Healthy</span>";
}

function GetHPColor(combatant: Combatant) {
    let monsterHpVerbosity = CurrentSettings().PlayerView.MonsterHPVerbosity;
    if (!combatant.IsPlayerCharacter &&
        (monsterHpVerbosity == "Monochrome Label" ||
            monsterHpVerbosity == "Hide All" ||
            monsterHpVerbosity == "Damage Taken")) {
        return "auto";
    }
    let green = Math.floor((combatant.CurrentHP() / combatant.MaxHP) * 170);
    let red = Math.floor((combatant.MaxHP - combatant.CurrentHP()) / combatant.MaxHP * 170);
    return "rgb(" + red + "," + green + ",0)";
}