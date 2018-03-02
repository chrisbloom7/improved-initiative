import { Encounter } from "../Encounter/Encounter";
import { SavedCombatant } from "../Encounter/SavedEncounter";
import { Dice } from "../Rules/Rules";
import { CurrentSettings } from "../Settings/Settings";
import { AbilityScores, StatBlock } from "../StatBlock/StatBlock";
import { Metrics } from "../Utility/Metrics";
import { probablyUniqueString } from "../Utility/Toolbox";
import { combatantCountsByName } from "../Utility/Toolbox";
import { Tag } from "./Tag";

export interface Combatant {
    Id: string;
    Encounter: Encounter;
    Alias: KnockoutObservable<string>;
    IndexLabel: number;
    MaxHP: number;
    CurrentHP: KnockoutObservable<number>;
    TemporaryHP: KnockoutObservable<number>;
    AC: number;
    AbilityModifiers: AbilityScores;
    Tags: KnockoutObservableArray<Tag>;
    InitiativeBonus: number;
    Initiative: KnockoutObservable<number>;
    InitiativeGroup: KnockoutObservable<string>;
    Hidden: KnockoutObservable<boolean>;
    HideAC: KnockoutObservable<boolean>;
    StatBlock: KnockoutObservable<StatBlock>;
    GetInitiativeRoll: () => number;
    IsPlayerCharacter: boolean;
}

export class Combatant implements Combatant {
    constructor(statBlockJson, public Encounter: Encounter, savedCombatant?: SavedCombatant) {
        let statBlock: StatBlock = { ...StatBlock.Default(), ...statBlockJson };

        if (savedCombatant) {
            statBlock.HP.Value = savedCombatant.MaxHP || savedCombatant.StatBlock.HP.Value;
            this.Id = "" + savedCombatant.Id; //legacy Id may be a number
        } else {
            statBlock.HP.Value = this.getMaxHP(statBlock);
            this.Id = statBlock.Id + "." + probablyUniqueString();
        }

        this.StatBlock(statBlock);

        this.processStatBlock(statBlock);

        this.StatBlock.subscribe((newStatBlock) => {
            this.processStatBlock(newStatBlock, statBlock);
            statBlock = newStatBlock;
        });

        this.CurrentHP = ko.observable(this.MaxHP);

        if (savedCombatant) {
            this.processSavedCombatant(savedCombatant);
        }

        this.Initiative.subscribe(newInitiative => {
            const groupId = this.InitiativeGroup();
            if (!this.updatingGroup && groupId) {
                this.updatingGroup = true;
                this.Encounter.Combatants().forEach(combatant => {
                    if (combatant.InitiativeGroup() === groupId) {
                        combatant.Initiative(newInitiative);
                    }
                });
                this.updatingGroup = false;
            }
        });
    }

    public Id = probablyUniqueString();
    public Alias = ko.observable("");
    public TemporaryHP = ko.observable(0);
    public Tags = ko.observableArray<Tag>();
    public Initiative = ko.observable(0);
    public InitiativeGroup = ko.observable<string>(null);
    public StatBlock = ko.observable<StatBlock>();
    public Hidden = ko.observable(false);
    public HideAC = ko.observable(true);

    public IndexLabel: number;
    public MaxHP: number;
    public CurrentHP: KnockoutObservable<number>;
    public PlayerDisplayHP: KnockoutComputed<string>;
    public AC: number;
    public AbilityModifiers: AbilityScores;
    public InitiativeBonus: number;
    public ConcentrationBonus: number;
    public IsPlayerCharacter = false;

    private updatingGroup = false;

    private processStatBlock(newStatBlock: StatBlock, oldStatBlock?: StatBlock) {
        this.setIndexLabel(oldStatBlock && oldStatBlock.Name);
        this.IsPlayerCharacter = newStatBlock.Player == "player";
        this.AC = newStatBlock.AC.Value;
        this.MaxHP = newStatBlock.HP.Value;
        this.AbilityModifiers = this.calculateModifiers();
        if (!newStatBlock.InitiativeModifier) {
            newStatBlock.InitiativeModifier = 0;
        }
        this.InitiativeBonus = this.AbilityModifiers.Dex + newStatBlock.InitiativeModifier || 0;
        this.ConcentrationBonus = this.AbilityModifiers.Con;
    }

    private processSavedCombatant(savedCombatant: SavedCombatant) {
        this.IndexLabel = savedCombatant.IndexLabel;
        this.CurrentHP(savedCombatant.CurrentHP);
        this.TemporaryHP(savedCombatant.TemporaryHP);
        this.Initiative(savedCombatant.Initiative);
        this.InitiativeGroup(savedCombatant.InitiativeGroup || null);
        this.Alias(savedCombatant.Alias);
        this.Tags(Tag.getLegacyTags(savedCombatant.Tags, this));
        this.Hidden(savedCombatant.Hidden);
        this.HideAC(savedCombatant.HideAC);
    }

    private getMaxHP(statBlock: StatBlock) {
        const rollMonsterHp = CurrentSettings().Rules.RollMonsterHp;
        if (rollMonsterHp && statBlock.Player !== "player") {
            try {
                const rolledHP = Dice.RollDiceExpression(statBlock.HP.Notes).Total;
                if (rolledHP > 0) {
                    return rolledHP;
                }
                return 1;
            } catch (e) {
                console.error(e);
                return statBlock.HP.Value;
            }
        }
        return statBlock.HP.Value;
    }

    private setIndexLabel(oldName?: string) {
        let name = this.StatBlock().Name;
        let counts = combatantCountsByName(name, this.Encounter.CombatantCountsByName(), oldName);
        this.IndexLabel = counts[name];
        this.Encounter.CombatantCountsByName(counts);
    }

    private calculateModifiers = () => {
        let modifiers = StatBlock.Default().Abilities;
        for (let attribute in this.StatBlock().Abilities) {
            modifiers[attribute] = this.Encounter.Rules.GetModifierFromScore(this.StatBlock().Abilities[attribute]);
        }
        return modifiers;
    }

    public GetInitiativeRoll = () => this.Encounter.Rules.AbilityCheck(this.InitiativeBonus, this.StatBlock().InitiativeAdvantage ? "advantage" : null);
    
    public GetConcentrationRoll = () => this.Encounter.Rules.AbilityCheck(this.ConcentrationBonus);

    public ApplyDamage(damage: number) {
        let currHP = this.CurrentHP(),
            tempHP = this.TemporaryHP(),
            allowNegativeHP = CurrentSettings().Rules.AllowNegativeHP;

        tempHP -= damage;
        if (tempHP < 0) {
            currHP += tempHP;
            tempHP = 0;
        }

        if (currHP <= 0 && !allowNegativeHP) {
            Metrics.TrackEvent("CombatantDefeated", { Name: this.DisplayName() });
            currHP = 0;
        }

        this.CurrentHP(currHP);
        this.TemporaryHP(tempHP);
    }

    public ApplyHealing(healing: number) {
        let currHP = this.CurrentHP();

        currHP += healing;
        if (currHP > this.MaxHP) {
            currHP = this.MaxHP;
        }

        this.CurrentHP(currHP);
    }

    public ApplyTemporaryHP(tempHP: number) {
        if (tempHP > this.TemporaryHP()) {
            this.TemporaryHP(tempHP);
        }
    }

    public DisplayName = ko.pureComputed(() => {
        const alias = ko.unwrap(this.Alias),
            name = ko.unwrap(this.StatBlock).Name,
            combatantCount = this.Encounter.CombatantCountsByName()[name],
            index = this.IndexLabel;

        if (alias) {
            return alias;
        }
        if (combatantCount > 1) {
            return name + " " + index;
        }

        return name;
    });
}
