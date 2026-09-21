@citi @browser
Feature: Add Citi offers from a saved list
  Cards start selected and saved offers stay usable, including after reopening
  the page. Only a deliberate click may contact Citi or add an offer.

  Background:
    Given a synthetic Citi page with the published userscript

  Scenario: Opening the page does not contact Citi
    When one minute passes without a click
    Then no Citi requests have been sent
    And the "Load cards & offers" button is enabled

  Scenario: Restored offers can be added without another offer scan
    Given I loaded offers and selected only card A
    When I reload the page
    Then the "Add saved offers" button is enabled
    And no new Citi requests have been sent
    And no disabled-action explanation is visible
    When I search for "nothing matches this search"
    And I click "Add saved offers"
    And the operation reports "Finished: 2/2"
    Then the enrollment requests are exactly
      | card   | offer |
      | card-a | a     |
      | card-a | b     |
    And no card offer lists were fetched after loading

  Scenario: Cached card selections cannot enroll under another login
    Given I loaded offers and selected only card A
    And Citi now returns only card C for the current login
    When I click "Add saved offers"
    And the operation reports "do not match this login"
    Then no enrollment requests have been sent
    And the "Add saved offers" button is enabled
    And the saved-offers button shows 2 available offers

  Scenario: Refresh finds new offers when the saved list is exhausted
    Given I loaded offers and selected only card A
    When I click "Add saved offers"
    And the operation reports "Finished: 2/2"
    Then the "Add saved offers" button is disabled
    Given Citi has a new offer "new-offer"
    When I click "Refresh & add offers"
    And the operation reports "Finished: 1/1"
    Then the enrollment requests are exactly
      | card   | offer     |
      | card-a | a         |
      | card-a | b         |
      | card-a | new-offer |

  Scenario: Loading selects every card without adding any offers
    When I click "Load cards & offers"
    And the operation reports "Loaded 2 cards"
    Then all loaded cards are selected
    And no enrollment requests have been sent
    When I reload the page
    Then all loaded cards are selected
    And no new Citi requests have been sent
